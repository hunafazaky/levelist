import { describe, expect, it } from "vitest";
import {
  describeRecurrence,
  nextOccurrenceDates,
  normalizeRecurrence,
  recurrenceMatches,
  taskActiveOn,
  taskAppliesOn,
  validateRecurrence,
} from "./recurrence";

describe("recurrenceMatches", () => {
  it("daily matches every date", () => {
    expect(recurrenceMatches({ type: "daily" }, "2026-10-03")).toBe(true);
  });

  it("weekdays matches only chosen days", () => {
    const r = { type: "weekdays", days: [0, 2] } as const; // Sun, Tue
    expect(recurrenceMatches(r, "2026-10-04")).toBe(true); // Sun
    expect(recurrenceMatches(r, "2026-10-05")).toBe(false); // Mon
    expect(recurrenceMatches(r, "2026-10-06")).toBe(true); // Tue
  });

  it("interval counts from the anchor and never before it", () => {
    const r = { type: "interval", every: 3, anchor: "2026-10-01" } as const;
    expect(recurrenceMatches(r, "2026-10-01")).toBe(true);
    expect(recurrenceMatches(r, "2026-10-02")).toBe(false);
    expect(recurrenceMatches(r, "2026-10-04")).toBe(true);
    expect(recurrenceMatches(r, "2026-09-28")).toBe(false);
  });
});

describe("taskAppliesOn", () => {
  const task = {
    recurrence: { type: "daily" } as const,
    createdOn: "2026-10-05",
    archivedOn: "2026-10-08",
  };

  it("respects createdOn (inclusive) and archivedOn (exclusive)", () => {
    expect(taskAppliesOn(task, "2026-10-04")).toBe(false);
    expect(taskAppliesOn(task, "2026-10-05")).toBe(true);
    expect(taskAppliesOn(task, "2026-10-07")).toBe(true);
    expect(taskAppliesOn(task, "2026-10-08")).toBe(false);
  });

  it("taskActiveOn ignores recurrence", () => {
    const weekly = { createdOn: "2026-10-01" };
    expect(taskActiveOn(weekly, "2026-10-02")).toBe(true);
    expect(taskActiveOn(weekly, "2026-09-30")).toBe(false);
  });
});

describe("nextOccurrenceDates", () => {
  it("lists upcoming Sundays, including today when it matches", () => {
    const task = {
      recurrence: { type: "weekdays", days: [0] } as const,
      createdOn: "2026-01-01",
    };
    expect(nextOccurrenceDates(task, "2026-10-04", 3)).toEqual([
      "2026-10-04",
      "2026-10-11",
      "2026-10-18",
    ]);
  });
});

describe("validate / normalize / describe", () => {
  it("rejects bad recurrences", () => {
    expect(validateRecurrence({ type: "weekdays", days: [] })).not.toBeNull();
    expect(validateRecurrence({ type: "weekdays", days: [7] })).not.toBeNull();
    expect(
      validateRecurrence({ type: "interval", every: 0, anchor: "2026-10-01" }),
    ).not.toBeNull();
    expect(
      validateRecurrence({ type: "interval", every: 2, anchor: "nope" }),
    ).not.toBeNull();
    expect(validateRecurrence({ type: "daily" })).toBeNull();
  });

  it("normalizes weekdays and collapses all seven into daily", () => {
    expect(normalizeRecurrence({ type: "weekdays", days: [2, 0, 2] })).toEqual({
      type: "weekdays",
      days: [0, 2],
    });
    expect(
      normalizeRecurrence({ type: "weekdays", days: [0, 1, 2, 3, 4, 5, 6] }),
    ).toEqual({ type: "daily" });
  });

  it("describes recurrences in plain words", () => {
    expect(describeRecurrence({ type: "daily" })).toBe("Every day");
    expect(describeRecurrence({ type: "weekdays", days: [0] })).toBe(
      "Every Sun",
    );
    expect(describeRecurrence({ type: "weekdays", days: [2, 0] })).toBe(
      "Every Sun and Tue",
    );
    expect(describeRecurrence({ type: "weekdays", days: [1, 3, 5] })).toBe(
      "Every Mon, Wed and Fri",
    );
    expect(
      describeRecurrence({ type: "interval", every: 3, anchor: "2026-10-01" }),
    ).toBe("Every 3 days");
  });
});
