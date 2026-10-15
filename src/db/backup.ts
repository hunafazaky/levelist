import { BACKUP_META_KEYS } from '../backup/validate'
import type { BackupContents } from '../backup/container'
import { CONFIG } from '../domain/config'
import type { DateStr } from '../domain/dates'
import { runCatchUp } from './repo'
import type { QuestDB } from './schema'
import { DAY_LEDGER_KINDS, type LedgerEntry, type Occurrence, type Proof, type Task } from './types'

const LAST_EXPORT = 'lastExportAt'

export interface ExportOptions {
  /** Leave photos out for a much smaller file. Finished tasks stay finished, just without a photo. */
  includePhotos?: boolean
  now?: number
}

/** Reads everything that belongs in a backup, as one consistent snapshot. */
export async function exportBackup(db: QuestDB, options: ExportOptions = {}): Promise<BackupContents> {
  const { includePhotos = true, now = Date.now() } = options
  return db.transaction('r', [db.tasks, db.occurrences, db.proofs, db.ledger, db.days, db.meta], async () => {
    const [tasks, occurrences, proofs, ledger, days, metaRows] = await Promise.all([
      db.tasks.toArray(),
      db.occurrences.toArray(),
      includePhotos ? db.proofs.toArray() : Promise.resolve<Proof[]>([]),
      db.ledger.toArray(),
      db.days.orderBy('date').toArray(),
      db.meta.toArray(),
    ])
    const meta: Record<string, string> = {}
    for (const row of metaRows) {
      if ((BACKUP_META_KEYS as readonly string[]).includes(row.key) && typeof row.value === 'string') {
        meta[row.key] = row.value
      }
    }
    return {
      exportedAt: now,
      tasks,
      // Without photos, drop the references so no occurrence points at a photo the file does not contain.
      occurrences: includePhotos
        ? occurrences
        : occurrences.map(({ proofId: _proofId, ...rest }): Occurrence => rest),
      days,
      ledger,
      meta,
      proofs,
    }
  })
}

/** Remembers when the person last exported, for the Backup screen. Device-local: never part of a backup. */
export async function markExported(db: QuestDB, now = Date.now()): Promise<void> {
  await db.meta.put({ key: LAST_EXPORT, value: now })
}

export async function lastExportedAt(db: QuestDB): Promise<number | undefined> {
  const row = await db.meta.get(LAST_EXPORT)
  return typeof row?.value === 'number' ? row.value : undefined
}

export type ImportMode = 'merge' | 'replace'

export interface ImportSummary {
  mode: ImportMode
  tasksAdded: number
  tasksUpdated: number
  occurrencesChanged: number
  photosAdded: number
}

/**
 * Which copy of the same occurrence to keep when both devices have it.
 * A finished task always beats an unfinished one (it carries a photo and earned XP), a photo beats no photo,
 * and "expired" beats "pending" because it is the later state of the same day.
 */
function pickOccurrence(local: Occurrence, incoming: Occurrence): Occurrence {
  if (local.status === 'done' && incoming.status === 'done') {
    return local.proofId !== undefined || incoming.proofId === undefined ? local : incoming
  }
  if (incoming.status === 'done') return incoming
  if (local.status === 'done') return local
  if (incoming.status === 'expired' && local.status === 'pending') return incoming
  return local
}

const sameOccurrence = (a: Occurrence, b: Occurrence) =>
  a.status === b.status && a.proofId === b.proofId && a.completedAt === b.completedAt

const earlier = (a: DateStr | undefined, b: DateStr | undefined) => (a === undefined ? b : b === undefined ? a : a < b ? a : b)

async function mergeInto(db: QuestDB, data: BackupContents, now: number): Promise<Omit<ImportSummary, 'mode'>> {
  // Tasks: the most recently edited copy wins.
  const localTasks = new Map((await db.tasks.toArray()).map((t) => [t.id, t]))
  const tasksToPut: Task[] = []
  let tasksAdded = 0
  let tasksUpdated = 0
  for (const t of data.tasks) {
    const local = localTasks.get(t.id)
    if (!local) {
      tasksToPut.push(t)
      tasksAdded++
    } else if (t.updatedAt > local.updatedAt) {
      tasksToPut.push(t)
      tasksUpdated++
    }
  }
  if (tasksToPut.length > 0) await db.tasks.bulkPut(tasksToPut)

  // Occurrences: combine per id.
  const localOccurrences = new Map((await db.occurrences.toArray()).map((o) => [o.id, o]))
  const occurrencesToPut: Occurrence[] = []
  for (const incoming of data.occurrences) {
    const local = localOccurrences.get(incoming.id)
    if (!local) {
      occurrencesToPut.push(incoming)
      continue
    }
    const chosen = pickOccurrence(local, incoming)
    if (!sameOccurrence(chosen, local)) occurrencesToPut.push(chosen)
  }

  // Photos: only the ones the merged occurrences point at and this device does not already have.
  const localProofIds = new Set((await db.proofs.toCollection().primaryKeys()) as string[])
  const incomingProofs = new Map(data.proofs.map((p) => [p.id, p]))
  const proofsToAdd = new Map<string, Proof>()
  for (const o of occurrencesToPut) {
    if (o.proofId !== undefined && !localProofIds.has(o.proofId)) {
      const proof = incomingProofs.get(o.proofId)
      if (proof) proofsToAdd.set(proof.id, proof)
    }
  }
  if (proofsToAdd.size > 0) await db.proofs.bulkPut([...proofsToAdd.values()])
  if (occurrencesToPut.length > 0) await db.occurrences.bulkPut(occurrencesToPut)

  // A task deleted on one device must not leave unfinished days behind on or after the delete, even if the other
  // device (which never heard) sent some: they would be scored as missed days for a task that no longer existed.
  // Finished ones stay, because the work was done. Days before the delete are real and also stay.
  for (const task of await db.tasks.filter((t) => t.archivedOn !== undefined).toArray()) {
    await db.occurrences
      .where('taskId')
      .equals(task.id)
      .filter((o) => o.status !== 'done' && o.date >= task.archivedOn!)
      .delete()
  }

  // XP for finished tasks: add what is missing. Day bonuses and penalties are not merged; they are recomputed below.
  const ledgerIds = new Set((await db.ledger.toCollection().primaryKeys()) as string[])
  const ledgerToAdd: LedgerEntry[] = data.ledger.filter((e) => e.kind === 'task_complete' && !ledgerIds.has(e.id))
  for (const e of ledgerToAdd) ledgerIds.add(e.id)
  for (const o of await db.occurrences.where('status').equals('done').toArray()) {
    const id = `task_complete_${o.id}`
    if (!ledgerIds.has(id)) {
      ledgerIds.add(id)
      ledgerToAdd.push({ id, date: o.date, kind: 'task_complete', delta: CONFIG.taskXp, refId: o.id, createdAt: now })
    }
  }
  if (ledgerToAdd.length > 0) await db.ledger.bulkAdd(ledgerToAdd)

  // Both devices scored their own days from their own view. Throw those scores away and let catch-up
  // score every finished day again from the combined occurrences.
  await db.days.clear()
  await db.ledger.where('kind').anyOf([...DAY_LEDGER_KINDS]).delete()
  await db.meta.delete('lastFinalizedDate')

  // Tasks that arrived from the file may be missing occurrences after the file's own last catch-up.
  const lastLocal = (await db.meta.get('lastCatchUpDate'))?.value
  const lastCatchUp = earlier(typeof lastLocal === 'string' ? lastLocal : undefined, data.meta.lastCatchUpDate)
  if (lastCatchUp !== undefined) await db.meta.put({ key: 'lastCatchUpDate', value: lastCatchUp })

  return { tasksAdded, tasksUpdated, occurrencesChanged: occurrencesToPut.length, photosAdded: proofsToAdd.size }
}

async function replaceWith(db: QuestDB, data: BackupContents): Promise<Omit<ImportSummary, 'mode'>> {
  await Promise.all([db.tasks.clear(), db.occurrences.clear(), db.proofs.clear(), db.ledger.clear(), db.days.clear()])
  for (const key of BACKUP_META_KEYS) await db.meta.delete(key)

  await db.tasks.bulkAdd(data.tasks)
  await db.proofs.bulkAdd(data.proofs)
  await db.occurrences.bulkAdd(data.occurrences)
  await db.ledger.bulkAdd(data.ledger)
  await db.days.bulkAdd(data.days)
  await db.meta.bulkPut(Object.entries(data.meta).map(([key, value]) => ({ key, value })))

  return {
    tasksAdded: data.tasks.length,
    tasksUpdated: 0,
    occurrencesChanged: data.occurrences.length,
    photosAdded: data.proofs.length,
  }
}

/**
 * Imports validated backup contents. All or nothing: if anything fails, the database is left as it was.
 *  - replace: this device becomes a copy of the backup
 *  - merge:   keep what is here and add what is new, keeping finished tasks from both sides
 * Afterwards the catch-up job runs for `today`, so days since the backup are created and scored.
 */
export async function importBackup(
  db: QuestDB,
  data: BackupContents,
  mode: ImportMode,
  today: DateStr,
  now = Date.now(),
): Promise<ImportSummary> {
  const counts = await db.transaction(
    'rw',
    [db.tasks, db.occurrences, db.proofs, db.ledger, db.days, db.meta],
    () => (mode === 'replace' ? replaceWith(db, data) : mergeInto(db, data, now)),
  )
  await runCatchUp(db, today, now)
  return { mode, ...counts }
}

const REMINDER_DISMISSED = 'backupReminderDismissedOn'

export interface BackupReminderInfo {
  lastExportAt?: number
  /** The first day anything was earned. */
  firstActivityDate?: DateStr
  dismissedOn?: DateStr
}

/** What the backup reminder needs to decide. Device-local: none of it is part of a backup. */
export async function backupReminderInfo(db: QuestDB): Promise<BackupReminderInfo> {
  const [last, first, dismissed] = await Promise.all([
    lastExportedAt(db),
    db.ledger.orderBy('date').first(),
    db.meta.get(REMINDER_DISMISSED),
  ])
  return {
    lastExportAt: last,
    firstActivityDate: first?.date,
    dismissedOn: typeof dismissed?.value === 'string' ? dismissed.value : undefined,
  }
}

/** "Later": stay quiet for the rest of today. */
export async function dismissBackupReminder(db: QuestDB, today: DateStr): Promise<void> {
  await db.meta.put({ key: REMINDER_DISMISSED, value: today })
}
