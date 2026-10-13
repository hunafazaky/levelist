import {
  WEEKDAY_SHORT,
  addDays,
  diffDays,
  type DateStr,
} from "../domain/dates";
import { weekdayOf } from "../domain/dates";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Sun 5 Oct" */
export function formatDate(d: DateStr): string {
  const [, m, day] = d.split("-").map(Number);
  return `${WEEKDAY_SHORT[weekdayOf(d)]} ${day} ${MONTHS[m - 1]}`;
}

/** "Today", "Tomorrow", or "Sun 5 Oct" */
export function formatRelative(d: DateStr, today: DateStr): string {
  const diff = diffDays(today, d);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return formatDate(d);
}

export { addDays };

/** "Tue 6 Oct, 08:24" */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const date = `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date}, ${time}`;
}

/** "1.4 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
