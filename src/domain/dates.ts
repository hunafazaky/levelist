/** A local calendar date, formatted "YYYY-MM-DD". */
export type DateStr = string;

const DAY_MS = 86_400_000;

function parts(d: DateStr): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Invalid DateStr: ${d}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function toUtcMs(d: DateStr): number {
  const [y, m, day] = parts(d);
  return Date.UTC(y, m - 1, day);
}

function fromUtcMs(ms: number): DateStr {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear().toString().padStart(4, "0");
  const m = (dt.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = dt.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The local calendar date for an instant. `dayStartHour` shifts the day boundary (e.g. 4 = day starts at 04:00). */
export function toDateStr(now: Date, dayStartHour = 0): DateStr {
  const shifted = new Date(now.getTime() - dayStartHour * 3_600_000);
  const y = shifted.getFullYear().toString().padStart(4, "0");
  const m = (shifted.getMonth() + 1).toString().padStart(2, "0");
  const d = shifted.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isDateStr(s: string): boolean {
  try {
    const [y, m, d] = parts(s);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  } catch {
    return false;
  }
}

export function addDays(d: DateStr, n: number): DateStr {
  return fromUtcMs(toUtcMs(d) + n * DAY_MS);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(d: DateStr): number {
  return new Date(toUtcMs(d)).getUTCDay();
}

/** Inclusive list of dates from `from` to `to`. Empty if `from > to`. */
export function dateRange(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let n = diffDays(from, to), i = 0; i <= n; i++)
    out.push(addDays(from, i));
  return out;
}

export const WEEKDAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
