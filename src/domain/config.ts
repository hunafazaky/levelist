/** Tunable game constants. Everything derived from the ledger can be recomputed after changing these. */
export const CONFIG = {
  taskXp: 100,
  allExpiredPenalty: -100,
  streakXp: 50,
  perfectBaseXp: 100,
  perfectStepXp: 15,
  levelBaseXp: 200,
  levelGrowth: 1.15,
  weekTiers: [1, 2, 4, 8, 12, 26, 52],
  /** Hours after midnight at which a new "day" starts (0 = midnight). */
  dayStartHour: 0,
} as const
