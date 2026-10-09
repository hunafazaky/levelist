import { CONFIG } from '../domain/config'
import { addDays, type DateStr } from '../domain/dates'
import {
  normalizeRecurrence,
  validateRecurrence,
  type Recurrence,
} from '../domain/recurrence'
import { missingOccurrences, occurrencesToExpire, staleOccurrences } from '../domain/schedule'
import type { QuestDB } from './schema'
import type { LedgerEntry, Occurrence, Proof, Task } from './types'

const LAST_CATCH_UP = 'lastCatchUpDate'

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
}

/**
 * Brings occurrences up to date as of `today`:
 *  1. creates every missing occurrence from the day after the last catch-up through today
 *  2. expires pending occurrences from days before today
 * Idempotent and safe to call on every app open or midnight rollover.
 */
export async function runCatchUp(db: QuestDB, today: DateStr): Promise<CatchUpResult> {
  return db.transaction('rw', db.tasks, db.occurrences, db.meta, async () => {
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
    return { created, expired: toExpire.length }
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
