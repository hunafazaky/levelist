import { describe, expect, it } from "vitest";
import { backupReminder, REMINDER_AFTER_DAYS } from "./reminder";

const today = "2026-10-14";

describe("backupReminder", () => {
  it("stays quiet until something has been earned, since there is nothing to lose", () => {
    expect(backupReminder({ today })).toMatchObject({
      due: false,
      neverExported: true,
    });
  });

  it("with no export yet, counts from the first activity and is due after a week", () => {
    expect(
      backupReminder({ today, firstActivityDate: "2026-10-08" }),
    ).toMatchObject({ due: false, days: 6 });
    expect(backupReminder({ today, firstActivityDate: "2026-10-07" })).toEqual({
      due: true,
      neverExported: true,
      days: 7,
    });
  });

  it("after an export, counts from the export instead, and ignores how long ago the first activity was", () => {
    expect(
      backupReminder({
        today,
        lastExportDate: "2026-10-11",
        firstActivityDate: "2026-01-01",
      }),
    ).toEqual({
      due: false,
      neverExported: false,
      days: 3,
    });
    expect(
      backupReminder({
        today,
        lastExportDate: "2026-10-07",
        firstActivityDate: "2026-01-01",
      }),
    ).toEqual({
      due: true,
      neverExported: false,
      days: 7,
    });
  });

  it('"Later" silences it for the rest of that day only', () => {
    const input = { today, lastExportDate: "2026-09-01" };
    expect(backupReminder({ ...input, dismissedOn: today }).due).toBe(false);
    expect(backupReminder({ ...input, dismissedOn: "2026-10-13" }).due).toBe(
      true,
    );
  });

  it("never reports negative days when the clock is behind the export", () => {
    expect(
      backupReminder({ today, lastExportDate: "2026-10-20" }),
    ).toMatchObject({ due: false, days: 0 });
  });

  it("uses a one week threshold", () => {
    expect(REMINDER_AFTER_DAYS).toBe(7);
  });
});
