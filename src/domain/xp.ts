import type { DateStr } from './dates'

/**
 * Total XP from ledger deltas in chronological order.
 * The running total never drops below 0: a penalty at 0 XP costs nothing.
 */
export function totalXp(deltas: readonly number[]): number {
  let total = 0
  for (const d of deltas) total = Math.max(0, total + d)
  return total
}

export interface LedgerLike {
  id: string
  date: DateStr
  kind: string
  delta: number
}

/**
 * Chronological order: by day, then task completions before that day's bonus or penalty
 * (the day entry is only written after the day ends), then by id for a stable result.
 * Never sort by creation time: after a long gap, several days are finalized in the same instant.
 */
export function sortLedger<T extends LedgerLike>(entries: readonly T[]): T[] {
  const rank = (e: T) => (e.kind === 'task_complete' ? 0 : 1)
  return [...entries].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

export interface XpPoint {
  date: DateStr
  /** Running total after this entry (floored at 0). */
  total: number
}

export function xpTimeline(entries: readonly LedgerLike[]): XpPoint[] {
  let total = 0
  return sortLedger(entries).map((e) => {
    total = Math.max(0, total + e.delta)
    return { date: e.date, total }
  })
}
