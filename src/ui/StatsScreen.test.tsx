// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/schema";
import type { DayRecord, LedgerEntry } from "../db/types";
import type { DayOutcome } from "../domain/days";
import { StatsScreen } from "./StatsScreen";

const day = (date: string, outcome: DayOutcome): DayRecord => ({
  date,
  outcome,
  scheduled: 1,
  done: outcome === "perfect" ? 1 : 0,
});
const entry = (
  id: string,
  date: string,
  kind: LedgerEntry["kind"],
  delta: number,
): LedgerEntry => ({
  id,
  date,
  kind,
  delta,
  createdAt: 0,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(cleanup);

describe("StatsScreen", () => {
  it("shows a fresh start: level 0, no streaks, everything locked", async () => {
    render(<StatsScreen today="2026-10-20" />);
    expect(
      await screen.findByRole("heading", { name: "Level 0" }),
    ).toBeTruthy();
    expect(
      screen.getByText("0 of 200 XP to level 1. Total 0 XP."),
    ).toBeTruthy();
    expect(screen.getByText(/^0 of \d+ unlocked$/)).toBeTruthy();
    expect(screen.queryByText("New")).toBeNull();
  });

  it("shows level, streaks, calendar and unlocked achievements from stored history", async () => {
    await db.days.bulkAdd([
      day("2026-10-10", "perfect"),
      day("2026-10-11", "perfect"),
      day("2026-10-12", "streak"),
      day("2026-10-13", "broken"),
      day("2026-10-14", "perfect"),
      day("2026-10-15", "rest"),
    ]);
    await db.ledger.bulkAdd([
      entry("t1", "2026-10-10", "task_complete", 100),
      entry("t2", "2026-10-11", "task_complete", 100),
      entry("t3", "2026-10-12", "task_complete", 100),
      entry("t4", "2026-10-14", "task_complete", 100),
      entry("day_2026-10-10", "2026-10-10", "day_perfect", 100),
      entry("day_2026-10-11", "2026-10-11", "day_perfect", 115),
      entry("day_2026-10-12", "2026-10-12", "day_streak", 50),
      entry("day_2026-10-13", "2026-10-13", "day_broken", -100),
      entry("day_2026-10-14", "2026-10-14", "day_perfect", 100),
    ]);

    render(<StatsScreen today="2026-10-20" />);

    expect(
      await screen.findByRole("heading", { name: "Level 2" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/^235 of \d+ XP to level 3\. Total 665 XP\.$/),
    ).toBeTruthy();

    const figure = (label: string) =>
      screen.getByText(label).parentElement!.textContent;
    expect(figure("Streak now")).toBe("Streak now2");
    expect(figure("Best streak")).toBe("Best streak3");
    expect(figure("Perfect now")).toBe("Perfect now2");
    expect(figure("Best perfect")).toBe("Best perfect2");

    expect(screen.getByLabelText("Mon 12 Oct: Streak day")).toBeTruthy();
    expect(screen.getByLabelText("Tue 13 Oct: Missed day")).toBeTruthy();
    expect(screen.getByLabelText("Thu 15 Oct: Rest day")).toBeTruthy();
    expect(
      screen.getByLabelText("Tue 20 Oct: today, still in progress"),
    ).toBeTruthy();
    expect(
      screen.getByText("3 perfect, 1 streak, 1 missed, 1 rest."),
    ).toBeTruthy();

    expect(screen.getByText(/^3 of \d+ unlocked$/)).toBeTruthy();
    const achievements = screen
      .getByRole("heading", { name: "Achievements" })
      .closest("section")!;
    const first = within(achievements).getByText("First streak").closest("li")!;
    expect(first.textContent).toContain("Sat 10 Oct");
    expect(
      within(achievements).getByText("First break").closest("li")!.textContent,
    ).toContain("Tue 13 Oct");
    expect(
      within(achievements).getByText("Level 10").closest("li")!.textContent,
    ).toContain("Locked");
    expect(screen.queryByText("New")).toBeNull(); // all unlocked a week or more ago
  });

  it("flags achievements unlocked in the last few days as new", async () => {
    await db.days.add(day("2026-10-19", "perfect"));
    await db.ledger.add(
      entry("day_2026-10-19", "2026-10-19", "day_perfect", 100),
    );
    render(<StatsScreen today="2026-10-20" />);
    await screen.findByRole("heading", { name: "Level 0" });
    expect((await screen.findAllByText("New")).length).toBe(2); // first streak + first perfect day
  });
});
