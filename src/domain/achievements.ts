import { CONFIG, type Rules } from "./config";
import type { DateStr } from "./dates";
import { levelFromXp } from "./levels";
import type { DayResult } from "./streaks";
import type { XpPoint } from "./xp";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** The day it was first earned. Unset while locked. Once earned, it stays earned. */
  unlockedOn?: DateStr;
}

function firstDate<T extends { date: DateStr }>(
  items: readonly T[],
  test: (item: T) => boolean,
): DateStr | undefined {
  return items.find(test)?.date;
}

function weeksLabel(n: number): string {
  return n === 1 ? "1 week" : `${n} weeks`;
}

/**
 * Every achievement, in display order, with the date it unlocked (if it has).
 * Derived entirely from the replayed days and the XP timeline, so nothing extra is stored.
 */
export function computeAchievements(
  results: readonly DayResult[],
  timeline: readonly XpPoint[],
  rules: Rules = CONFIG,
): Achievement[] {
  const list: Achievement[] = [
    {
      id: "first_streak",
      title: "First streak",
      description: "Finish at least one task in a day.",
      unlockedOn: firstDate(
        results,
        (r) => r.outcome === "streak" || r.outcome === "perfect",
      ),
    },
    {
      id: "first_perfect",
      title: "First perfect day",
      description: "Finish every task scheduled for a day.",
      unlockedOn: firstDate(results, (r) => r.outcome === "perfect"),
    },
  ];

  for (const n of rules.weekTiers) {
    list.push({
      id: `streak_weeks_${n}`,
      title: `${weeksLabel(n)} streak`,
      description: `Keep your streak going for ${weeksLabel(n)} straight. Perfect days count too.`,
      unlockedOn: firstDate(results, (r) => r.streak >= n * 7),
    });
  }
  for (const n of rules.weekTiers) {
    list.push({
      id: `perfect_weeks_${n}`,
      title: `${weeksLabel(n)} perfect`,
      description: `Have a perfect day, every day, for ${weeksLabel(n)} straight.`,
      unlockedOn: firstDate(results, (r) => r.perfectRun >= n * 7),
    });
  }

  list.push({
    id: "first_break",
    title: "First break",
    description:
      "Lose a running streak for the first time. Start again the next day.",
    unlockedOn: firstDate(results, (r) => r.brokeStreak),
  });

  for (const m of rules.levelMilestones) {
    list.push({
      id: `level_${m}`,
      title: `Level ${m}`,
      description: `Reach level ${m}.`,
      // Based on the first time XP crossed the line, so a later XP drop does not take it away.
      unlockedOn: firstDate(
        timeline,
        (p) => levelFromXp(p.total, rules).level >= m,
      ),
    });
  }

  return list;
}
