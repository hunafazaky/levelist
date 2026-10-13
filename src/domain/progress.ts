import { computeAchievements, type Achievement } from "./achievements";
import { CONFIG, type Rules } from "./config";
import { levelFromXp, type LevelInfo } from "./levels";
import { replayDays, type DayRecordLike, type DayResult } from "./streaks";
import { xpTimeline, type LedgerLike } from "./xp";

export interface Progress {
  totalXp: number;
  level: LevelInfo;
  /** Finished days (paused days are not stored), oldest first. */
  results: DayResult[];
  /** Streak lengths as of the last finished day. */
  streak: number;
  perfectRun: number;
  bestStreak: number;
  bestPerfectRun: number;
  achievements: Achievement[];
}

/** Everything the UI shows about progress, derived from the finished days and the ledger. */
export function computeProgress(
  days: readonly DayRecordLike[],
  ledger: readonly LedgerLike[],
  rules: Rules = CONFIG,
): Progress {
  const results = replayDays(days, rules);
  const timeline = xpTimeline(ledger);
  const total = timeline.length > 0 ? timeline[timeline.length - 1].total : 0;
  const last = results[results.length - 1];
  return {
    totalXp: total,
    level: levelFromXp(total, rules),
    results,
    streak: last?.streak ?? 0,
    perfectRun: last?.perfectRun ?? 0,
    bestStreak: results.reduce((m, r) => Math.max(m, r.streak), 0),
    bestPerfectRun: results.reduce((m, r) => Math.max(m, r.perfectRun), 0),
    achievements: computeAchievements(results, timeline, rules),
  };
}
