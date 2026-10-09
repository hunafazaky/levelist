import type { DateStr } from '../domain/dates'
import type { Recurrence } from '../domain/recurrence'
import type { OccurrenceStatus } from '../domain/schedule'

export interface Task {
  id: string
  title: string
  recurrence: Recurrence
  /** First day the task can appear. */
  createdOn: DateStr
  /** Set when the user deletes the task. It no longer appears on or after this day; history is kept. */
  archivedOn?: DateStr
  createdAt: number
  updatedAt: number
}

export interface Occurrence {
  /** Deterministic: `${taskId}_${date}`, so creating the same occurrence twice is a no-op. */
  id: string
  taskId: string
  date: DateStr
  /** Title as it was when the occurrence was created. */
  title: string
  status: OccurrenceStatus
  /** Set in milestone 2 when proof is submitted. */
  proofId?: string
  completedAt?: number
}

export interface MetaRow {
  key: string
  value: unknown
}

export interface Proof {
  id: string
  blob: Blob
  mime: string
  createdAt: number
}

/** Milestone 3 adds the day-level kinds (streak, perfect, broken). */
export type LedgerKind = 'task_complete'

/** Append-only. Totals, levels and streaks are derived from these rows, never stored. */
export interface LedgerEntry {
  /** Deterministic per source event, so awarding the same event twice is impossible. */
  id: string
  date: import('../domain/dates').DateStr
  kind: LedgerKind
  delta: number
  refId?: string
  createdAt: number
}
