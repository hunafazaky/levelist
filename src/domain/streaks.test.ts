import { describe, expect, it } from "vitest";
import { CONFIG } from "./config";
import { addDays } from "./dates";
import type { DayOutcome } from "./days";
import { forecastDay, perfectXp, previewDay, replayDays } from "./streaks";

/** Consecutive days starting 2026-10-01. */
function seq(...outcomes: DayOutcome[]) {
  return outcomes.map((outcome, i) => ({
    date: addDays("2026-10-01", i),
    outcome,
  }));
}
const xp = (...o: DayOutcome[]) => replayDays(seq(...o)).map((r) => r.xp);

describe("perfectXp", () => {
  it("grows by 15 for each further perfect day", () => {
    expect([1, 2, 3, 4].map((n) => perfectXp(n))).toEqual([100, 115, 130, 145]);
  });
});

describe("replayDays XP", () => {
  it("awards 100, 115, 130 for consecutive perfect days, then resets after a plain streak day", () => {
    expect(xp("perfect", "perfect", "perfect", "streak", "perfect")).toEqual([
      100, 115, 130, 50, 100,
    ]);
  });

  it("awards +50 for a streak day and -100 when every task expired", () => {
    expect(xp("streak", "broken")).toEqual([50, -100]);
  });

  it("rest days earn nothing and do not grow the bonus, but keep the run alive", () => {
    const r = replayDays(seq("perfect", "rest", "perfect"));
    expect(r.map((x) => x.xp)).toEqual([100, 0, 115]);
    expect(r.map((x) => x.perfectRun)).toEqual([1, 2, 3]);
    expect(r.map((x) => x.streak)).toEqual([1, 2, 3]);
  });

  it("resets the bonus after a broken day", () => {
    expect(xp("perfect", "perfect", "broken", "perfect")).toEqual([
      100, 115, -100, 100,
    ]);
  });

  it("paused days change nothing", () => {
    const r = replayDays(seq("perfect", "paused", "perfect"));
    expect(r.map((x) => x.xp)).toEqual([100, 0, 115]);
    expect(r.map((x) => x.streak)).toEqual([1, 1, 2]);
  });

  it("can award rest days like perfect days when the rule is switched on", () => {
    const r = replayDays(seq("rest", "rest", "perfect"), {
      ...CONFIG,
      restDayAwardsXp: true,
    });
    expect(r.map((x) => x.xp)).toEqual([100, 115, 130]);
  });

  it("sorts days by date before replaying", () => {
    const shuffled = [
      seq("perfect", "streak", "perfect")[2],
      seq("perfect", "streak", "perfect")[0],
      seq("perfect", "streak", "perfect")[1],
    ];
    expect(replayDays(shuffled).map((r) => r.xp)).toEqual([100, 50, 100]);
  });
});

describe("replayDays streaks", () => {
  it("a plain streak day extends the streak but resets the perfect streak", () => {
    const r = replayDays(seq("perfect", "perfect", "streak"));
    expect(r.map((x) => x.streak)).toEqual([1, 2, 3]);
    expect(r.map((x) => x.perfectRun)).toEqual([1, 2, 0]);
  });

  it("a rest day after a plain streak day starts a new perfect run without bonus progress", () => {
    const r = replayDays(seq("streak", "rest", "perfect"));
    expect(r.map((x) => x.perfectRun)).toEqual([0, 1, 2]);
    expect(r.map((x) => x.xp)).toEqual([50, 0, 100]);
  });

  it("a broken day ends the streak and flags it only if a streak was running", () => {
    const r = replayDays(seq("perfect", "perfect", "broken", "broken"));
    expect(r.map((x) => x.streak)).toEqual([1, 2, 0, 0]);
    expect(r.map((x) => x.brokeStreak)).toEqual([false, false, true, false]);
    expect(replayDays(seq("broken"))[0].brokeStreak).toBe(false);
  });
});

describe("previewDay and forecastDay", () => {
  const history = seq("perfect", "perfect"); // today would be the third perfect day

  it("previews a day as if it ended now, ignoring any record already stored for that date", () => {
    const today = addDays("2026-10-01", 2);
    const p = previewDay(
      [...history, { date: today, outcome: "broken" }],
      today,
      {
        scheduled: 2,
        done: 2,
        hasActiveTask: true,
      },
    );
    expect(p).toMatchObject({
      outcome: "perfect",
      xp: 130,
      streak: 3,
      perfectRun: 3,
    });
  });

  it("forecasts the outcome now and the bonus for finishing everything", () => {
    const today = addDays("2026-10-01", 2);
    expect(forecastDay(history, today, 2, 0)).toMatchObject({
      outcome: "broken",
      xp: -100,
      perfectXp: 130,
    });
    expect(forecastDay(history, today, 2, 1)).toMatchObject({
      outcome: "streak",
      xp: 50,
      perfectXp: 130,
      streak: 3,
    });
    expect(forecastDay(history, today, 2, 2)).toMatchObject({
      outcome: "perfect",
      xp: 130,
      perfectRun: 3,
    });
  });
});
