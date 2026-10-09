/**
 * Total XP from ledger deltas in chronological order.
 * The running total never drops below 0: a penalty at 0 XP costs nothing.
 */
export function totalXp(deltas: readonly number[]): number {
  let total = 0
  for (const d of deltas) total = Math.max(0, total + d)
  return total
}
