import type { DateStr } from '../domain/dates'
import type { DayOutcome } from '../domain/days'
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

/** `task_complete` is written when a task is done; the `day_*` kinds when a finished day is scored. */
export type LedgerKind = 'task_complete' | 'day_perfect' | 'day_streak' | 'day_broken' | 'day_rest'

/** Ledger kinds that are derived from finished days (as opposed to `task_complete`). */
export const DAY_LEDGER_KINDS: readonly LedgerKind[] = ['day_perfect', 'day_streak', 'day_broken', 'day_rest']

/** Append-only. Totals, levels and streaks are derived from these rows, never stored. */
export interface LedgerEntry {
  /** Deterministic per source event (`task_complete_<occurrenceId>`, `day_<date>`), so nothing is awarded twice. */
  id: string
  date: DateStr
  kind: LedgerKind
  delta: number
  refId?: string
  createdAt: number
}

/** A finished day. Written once when the day is finalized and never changed afterwards. Paused days are not stored. */
export interface DayRecord {
  /** Primary key. */
  date: DateStr
  outcome: DayOutcome
  scheduled: number
  done: number
}
