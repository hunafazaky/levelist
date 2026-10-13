/** Tunable game rules. Pure functions take a `Rules` argument (defaulting to CONFIG) so tests can vary them. */
export interface Rules {
  taskXp: number;
  /** Awarded for a day on which every scheduled task expired. */
  allExpiredPenalty: number;
  streakXp: number;
  perfectBaseXp: number;
  /** Added for each further consecutive perfect day. */
  perfectStepXp: number;
  /** Rest days keep streaks alive but earn nothing (decided with the owner). */
  restDayAwardsXp: boolean;
  /** XP needed to go from level 0 to level 1. */
  levelBaseXp: number;
  /** Each level needs this many times more XP than the one before. */
  levelGrowth: number;
  /** Week counts that unlock "n weeks straight" achievements. */
  weekTiers: readonly number[];
  /** Levels that unlock an achievement (multiples of ten). */
  levelMilestones: readonly number[];
  /** Hours after midnight at which a new "day" starts (0 = midnight). */
  dayStartHour: number;
}

export const CONFIG: Rules = {
  taskXp: 100,
  allExpiredPenalty: -100,
  streakXp: 50,
  perfectBaseXp: 100,
  perfectStepXp: 15,
  restDayAwardsXp: false,
  levelBaseXp: 200,
  levelGrowth: 1.15,
  weekTiers: [1, 2, 4, 8, 12, 26, 52],
  levelMilestones: [10, 20, 30, 40, 50],
  dayStartHour: 0,
};
