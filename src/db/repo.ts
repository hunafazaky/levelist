import { CONFIG } from '../domain/config'
import { addDays, dateRange, type DateStr } from '../domain/dates'
import { classifyDay, type DayOutcome } from '../domain/days'
import {
  normalizeRecurrence,
  taskActiveOn,
  validateRecurrence,
  type Recurrence,
} from '../domain/recurrence'
import { missingOccurrences, occurrencesToExpire, staleOccurrences } from '../domain/schedule'
import { replayDays } from '../domain/streaks'
import type { QuestDB } from './schema'
import type { DayRecord, LedgerEntry, LedgerKind, Occurrence, Proof, Task } from './types'

const LAST_CATCH_UP = 'lastCatchUpDate'
const LAST_FINALIZED = 'lastFinalizedDate'

export interface TaskInput {
  title: string
  recurrence: Recurrence
}

function cleanTitle(title: string): string {
  const t = title.trim().replace(/\s+/g, ' ')
  if (t.length === 0) throw new Error('Give the task a title.')
  if (t.length > 120) throw new Error('Keep the title under 120 characters.')
  return t
}

function cleanRecurrence(r: Recurrence): Recurrence {
  const normalized = normalizeRecurrence(r)
  const error = validateRecurrence(normalized)
  if (error) throw new Error(error)
  return normalized
}

function occurrenceId(taskId: string, date: DateStr): string {
  return `${taskId}_${date}`
}

/**
 * Makes `date` consistent with the current tasks: creates the occurrences that should exist and
 * removes pending ones that no longer match. Done and expired occurrences are never touched.
 * Must run inside a transaction on tasks + occurrences.
 */
async function syncDay(db: QuestDB, date: DateStr): Promise<void> {
  const tasks = await db.tasks.toArray()
  const existing = await db.occurrences.where('date').equals(date).toArray()

  const stale = staleOccurrences(tasks, existing, date)
  if (stale.length > 0) await db.occurrences.bulkDelete(stale.map((o) => o.id))

  const planned = missingOccurrences(tasks, existing, date, date)
  if (planned.length > 0) {
    await db.occurrences.bulkAdd(
      planned.map((p) => ({
        id: occurrenceId(p.taskId, p.date),
        taskId: p.taskId,
        date: p.date,
        title: p.title,
        status: 'pending' as const,
      })),
    )
  }
}

export async function createTask(db: QuestDB, input: TaskInput, today: DateStr, now = Date.now()): Promise<Task> {
  const task: Task = {
    id: crypto.randomUUID(),
    title: cleanTitle(input.title),
    recurrence: cleanRecurrence(input.recurrence),
    createdOn: today,
    createdAt: now,
    updatedAt: now,
  }
  await db.transaction('rw', db.tasks, db.occurrences, async () => {
    await db.tasks.add(task)
    await syncDay(db, today)
  })
  return task
}

export async function updateTask(
  db: QuestDB,
  id: string,
  input: Partial<TaskInput>,
  today: DateStr,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', db.tasks, db.occurrences, async () => {
    const task = await db.tasks.get(id)
    if (!task || task.archivedOn !== undefined) throw new Error('This task no longer exists.')
    const patch: Partial<Task> = { updatedAt: now }
    if (input.title !== undefined) patch.title = cleanTitle(input.title)
    if (input.recurrence !== undefined) patch.recurrence = cleanRecurrence(input.recurrence)
    await db.tasks.update(id, patch)

    if (patch.title !== undefined) {
      await db.occurrences
        .where('taskId')
        .equals(id)
        .filter((o) => o.status === 'pending')
        .modify({ title: patch.title })
    }
    await syncDay(db, today)
  })
}

/** "Delete" a task: it stops appearing from today on, past history stays. */
export async function archiveTask(db: QuestDB, id: string, today: DateStr, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.tasks, db.occurrences, async () => {
    const task = await db.tasks.get(id)
    if (!task || task.archivedOn !== undefined) return
    await db.tasks.update(id, { archivedOn: today, updatedAt: now })
    await syncDay(db, today)
  })
}

export interface CatchUpResult {
  created: number
  expired: number
  /** Finished days that were scored (paused days are skipped). */
  finalized: number
}

const DAY_KIND: Partial<Record<DayOutcome, LedgerKind>> = {
  perfect: 'day_perfect',
  streak: 'day_streak',
  broken: 'day_broken',
  rest: 'day_rest',
}

/**
 * Scores every finished day that has not been scored yet (from the day after the last one, up to yesterday):
 * classifies it from its occurrences, stores a DayRecord, and appends the day's XP to the ledger.
 *
 * Classification looks at occurrences first, so a task completed and then deleted the same day still counts.
 * Existing records and ledger entries are never overwritten, which makes this safe to repeat.
 * Must run after expiry, inside a transaction on tasks, occurrences, meta, days and ledger.
 */
async function finalizeDays(db: QuestDB, today: DateStr, now: number): Promise<number> {
  const tasks = await db.tasks.toArray()
  const lastRow = await db.meta.get(LAST_FINALIZED)
  const last = typeof lastRow?.value === 'string' ? lastRow.value : undefined
  const earliest = tasks.reduce<DateStr | undefined>(
    (min, t) => (min === undefined || t.createdOn < min ? t.createdOn : min),
    undefined,
  )
  const from = last !== undefined ? addDays(last, 1) : earliest
  const to = addDays(today, -1)
  if (from === undefined || from > to) return 0

  const occurrences = await db.occurrences.where('date').between(from, to, true, true).toArray()
  const byDate = new Map<DateStr, Occurrence[]>()
  for (const o of occurrences) byDate.set(o.date, [...(byDate.get(o.date) ?? []), o])

  const alreadyScored = new Set((await db.days.where('date').between(from, to, true, true).toArray()).map((d) => d.date))
  const records: DayRecord[] = []
  for (const date of dateRange(from, to)) {
    if (alreadyScored.has(date)) continue
    const list = byDate.get(date) ?? []
    const outcome = classifyDay({
      scheduled: list.length,
      done: list.filter((o) => o.status === 'done').length,
      hasActiveTask: tasks.some((t) => taskActiveOn(t, date)),
    })
    if (outcome === 'paused') continue
    records.push({ date, outcome, scheduled: list.length, done: list.filter((o) => o.status === 'done').length })
  }
  if (records.length > 0) await db.days.bulkAdd(records)

  // The bonus for a perfect day depends on the run before it, so score from the full history.
  const results = replayDays(await db.days.orderBy('date').toArray())
  const fresh = new Set(records.map((r) => r.date))
  const candidates: LedgerEntry[] = results
    .filter((r) => fresh.has(r.date) && r.xp !== 0)
    .map((r) => ({
      id: `day_${r.date}`,
      date: r.date,
      kind: DAY_KIND[r.outcome]!,
      delta: r.xp,
      createdAt: now,
    }))
  const existing = await db.ledger.bulkGet(candidates.map((c) => c.id))
  const toAdd = candidates.filter((_, i) => existing[i] === undefined)
  if (toAdd.length > 0) await db.ledger.bulkAdd(toAdd)

  await db.meta.put({ key: LAST_FINALIZED, value: to })
  return records.length
}

/**
 * Brings everything up to date as of `today`:
 *  1. creates every missing occurrence from the day after the last catch-up through today
 *  2. expires pending occurrences from days before today
 *  3. scores every finished day not scored yet (streaks, XP, penalties)
 * Idempotent and safe to call on every app open or midnight rollover.
 */
export async function runCatchUp(db: QuestDB, today: DateStr, now = Date.now()): Promise<CatchUpResult> {
  return db.transaction('rw', [db.tasks, db.occurrences, db.meta, db.days, db.ledger], async () => {
    const tasks = await db.tasks.toArray()
    const lastRow = await db.meta.get(LAST_CATCH_UP)
    const last = typeof lastRow?.value === 'string' ? lastRow.value : undefined

    const earliestCreated = tasks.reduce<DateStr | undefined>(
      (min, t) => (min === undefined || t.createdOn < min ? t.createdOn : min),
      undefined,
    )
    const from = last !== undefined ? addDays(last, 1) : (earliestCreated ?? today)

    let created = 0
    if (from <= today) {
      const existing = await db.occurrences.where('date').between(from, today, true, true).toArray()
      const planned = missingOccurrences(tasks, existing, from, today)
      if (planned.length > 0) {
        await db.occurrences.bulkAdd(
          planned.map((p) => ({
            id: occurrenceId(p.taskId, p.date),
            taskId: p.taskId,
            date: p.date,
            title: p.title,
            status: 'pending' as const,
          })),
        )
      }
      created = planned.length
    }

    const pending = await db.occurrences.where('status').equals('pending').toArray()
    const toExpire = occurrencesToExpire(pending, today)
    if (toExpire.length > 0) {
      await db.occurrences.bulkPut(toExpire.map((o): Occurrence => ({ ...o, status: 'expired' })))
    }

    await db.meta.put({ key: LAST_CATCH_UP, value: today })
    const finalized = await finalizeDays(db, today, now)
    return { created, expired: toExpire.length, finalized }
  })
}

export interface ProofInput {
  blob: Blob
  mime: string
}

/**
 * Marks today's pending occurrence as done. A proof image is required: there is no way to complete without one.
 * Stores the proof and appends the +XP ledger entry in the same transaction.
 */
export async function completeOccurrence(
  db: QuestDB,
  occurrenceId: string,
  proof: ProofInput,
  today: DateStr,
  now = Date.now(),
): Promise<LedgerEntry> {
  if (!proof.blob || proof.blob.size === 0) throw new Error('Add a photo as proof first.')

  return db.transaction('rw', db.occurrences, db.proofs, db.ledger, async () => {
    const occ = await db.occurrences.get(occurrenceId)
    if (!occ) throw new Error('This task is no longer on your list.')
    if (occ.status === 'done') throw new Error('This task is already done.')
    if (occ.status === 'expired' || occ.date < today) throw new Error('That day is over, so this task has expired.')
    if (occ.date > today) throw new Error('This task is not due yet.')

    const proofRow: Proof = { id: crypto.randomUUID(), blob: proof.blob, mime: proof.mime, createdAt: now }
    await db.proofs.add(proofRow)
    await db.occurrences.update(occ.id, { status: 'done', proofId: proofRow.id, completedAt: now })

    const entry: LedgerEntry = {
      id: `task_complete_${occ.id}`,
      date: occ.date,
      kind: 'task_complete',
      delta: CONFIG.taskXp,
      refId: occ.id,
      createdAt: now,
    }
    await db.ledger.add(entry)
    return entry
  })
}
