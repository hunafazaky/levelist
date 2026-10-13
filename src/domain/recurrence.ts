import {
  addDays,
  diffDays,
  isDateStr,
  weekdayOf,
  WEEKDAY_SHORT,
  type DateStr,
} from "./dates";

export type Recurrence =
  | { type: "daily" }
  | { type: "weekdays"; days: readonly number[] } // 0 = Sun … 6 = Sat
  | { type: "interval"; every: number; anchor: DateStr };

/** The minimum a task needs for scheduling decisions. */
export interface Schedulable {
  recurrence: Recurrence;
  createdOn: DateStr;
  archivedOn?: DateStr;
}

export function recurrenceMatches(r: Recurrence, date: DateStr): boolean {
  switch (r.type) {
    case "daily":
      return true;
    case "weekdays":
      return r.days.includes(weekdayOf(date));
    case "interval": {
      const delta = diffDays(r.anchor, date);
      return delta >= 0 && delta % r.every === 0;
    }
  }
}

/** Whether the task should have an occurrence on `date`. */
export function taskAppliesOn(task: Schedulable, date: DateStr): boolean {
  if (date < task.createdOn) return false;
  if (task.archivedOn !== undefined && date >= task.archivedOn) return false;
  return recurrenceMatches(task.recurrence, date);
}

/** Whether the task exists (is not archived, already created) on `date`, regardless of recurrence. */
export function taskActiveOn(
  task: Pick<Schedulable, "createdOn" | "archivedOn">,
  date: DateStr,
): boolean {
  if (date < task.createdOn) return false;
  return task.archivedOn === undefined || date < task.archivedOn;
}

/** The next `count` dates on or after `from` when the task applies. */
export function nextOccurrenceDates(
  task: Schedulable,
  from: DateStr,
  count: number,
  horizonDays = 800,
): DateStr[] {
  const out: DateStr[] = [];
  for (let i = 0; i < horizonDays && out.length < count; i++) {
    const d = addDays(from, i);
    if (taskAppliesOn(task, d)) out.push(d);
  }
  return out;
}

/** Returns an error message, or null if the recurrence is valid. */
export function validateRecurrence(r: Recurrence): string | null {
  switch (r.type) {
    case "daily":
      return null;
    case "weekdays":
      if (r.days.length === 0) return "Pick at least one weekday.";
      if (r.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
        return "Weekdays must be between 0 and 6.";
      return null;
    case "interval":
      if (!Number.isInteger(r.every) || r.every < 1)
        return "Interval must be a whole number of days, 1 or more.";
      if (!isDateStr(r.anchor)) return "Interval needs a valid start date.";
      return null;
  }
}

/** Normalizes weekdays (sorted, unique) so equal recurrences compare equal. */
export function normalizeRecurrence(r: Recurrence): Recurrence {
  if (r.type === "weekdays") {
    const days = [...new Set(r.days)].sort((a, b) => a - b);
    return days.length === 7 ? { type: "daily" } : { type: "weekdays", days };
  }
  return r;
}

export function describeRecurrence(r: Recurrence): string {
  switch (r.type) {
    case "daily":
      return "Every day";
    case "weekdays": {
      const names = [...r.days]
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_SHORT[d]);
      if (names.length === 1) return `Every ${names[0]}`;
      return `Every ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    }
    case "interval":
      return r.every === 1 ? "Every day" : `Every ${r.every} days`;
  }
}
