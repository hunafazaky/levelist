import { CONFIG, type Rules } from "./config";
import type { DateStr } from "./dates";
import { classifyDay, type DayCounts, type DayOutcome } from "./days";

export interface DayRecordLike {
  date: DateStr;
  outcome: DayOutcome;
}

/** The state after one finished day, plus the XP that day earned. */
export interface DayResult {
  date: DateStr;
  outcome: DayOutcome;
  /** Streak length after this day. */
  streak: number;
  /** Perfect-streak length after this day. */
  perfectRun: number;
  /** Real perfect days in the current perfect run; drives the growing bonus. */
  perfectDays: number;
  /** Day-level XP (the +100 per task is awarded separately, at completion). */
  xp: number;
  /** True when this day ended a streak that was running. */
  brokeStreak: boolean;
}

/** Bonus for the nth consecutive perfect day: 100, 115, 130, 145, … */
export function perfectXp(n: number, rules: Rules = CONFIG): number {
  return rules.perfectBaseXp + rules.perfectStepXp * (n - 1);
}

/**
 * Replays finished days in date order and returns the state and XP for each.
 *
 * `streak`, `perfect` and `rest` days extend the streak. `perfect` and `rest` extend the perfect streak.
 * A `streak` or `broken` day resets the perfect streak. `paused` days change nothing.
 * `rest` days keep the perfect run alive but do not grow the bonus counter.
 */
export function replayDays(
  days: readonly DayRecordLike[],
  rules: Rules = CONFIG,
): DayResult[] {
  const sorted = [...days].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  let streak = 0;
  let perfectRun = 0;
  let perfectDays = 0;
  const out: DayResult[] = [];

  for (const { date, outcome } of sorted) {
    let xp = 0;
    let brokeStreak = false;
    switch (outcome) {
      case "paused":
        break;
      case "rest":
        streak++;
        perfectRun++;
        if (rules.restDayAwardsXp) {
          perfectDays++;
          xp = perfectXp(perfectDays, rules);
        }
        break;
      case "perfect":
        streak++;
        perfectRun++;
        perfectDays++;
        xp = perfectXp(perfectDays, rules);
        break;
      case "streak":
        streak++;
        perfectRun = 0;
        perfectDays = 0;
        xp = rules.streakXp;
        break;
      case "broken":
        brokeStreak = streak > 0;
        streak = 0;
        perfectRun = 0;
        perfectDays = 0;
        xp = rules.allExpiredPenalty;
        break;
    }
    out.push({
      date,
      outcome,
      streak,
      perfectRun,
      perfectDays,
      xp,
      brokeStreak,
    });
  }
  return out;
}

/** What `date` would be worth if it ended now, given the finished days before it. */
export function previewDay(
  days: readonly DayRecordLike[],
  date: DateStr,
  counts: DayCounts,
  rules: Rules = CONFIG,
): DayResult {
  const results = replayDays(
    [
      ...days.filter((d) => d.date < date),
      { date, outcome: classifyDay(counts) },
    ],
    rules,
  );
  return results[results.length - 1];
}

export interface DayForecast {
  /** How the day would be classified if it ended now. */
  outcome: DayOutcome;
  /** Day-level XP if it ended now. */
  xp: number;
  /** Day-level XP if every remaining task were finished. */
  perfectXp: number;
  streak: number;
  perfectRun: number;
}

export function forecastDay(
  days: readonly DayRecordLike[],
  date: DateStr,
  scheduled: number,
  done: number,
  rules: Rules = CONFIG,
): DayForecast {
  const now = previewDay(
    days,
    date,
    { scheduled, done, hasActiveTask: true },
    rules,
  );
  const full = previewDay(
    days,
    date,
    { scheduled, done: scheduled, hasActiveTask: true },
    rules,
  );
  return {
    outcome: now.outcome,
    xp: now.xp,
    perfectXp: full.xp,
    streak: now.streak,
    perfectRun: now.perfectRun,
  };
}
