import { dateRange, type DateStr } from "./dates";
import { taskAppliesOn, type Schedulable } from "./recurrence";

export type OccurrenceStatus = "pending" | "done" | "expired";

export interface TaskLike extends Schedulable {
  id: string;
  title: string;
}

export interface OccurrenceLike {
  taskId: string;
  date: DateStr;
  status: OccurrenceStatus;
}

export interface PlannedOccurrence {
  taskId: string;
  date: DateStr;
  title: string;
}

/**
 * Occurrences that should exist for tasks over [from, to] (inclusive) but do not yet.
 * Idempotent: pass the occurrences that already exist and they are skipped.
 */
export function missingOccurrences(
  tasks: TaskLike[],
  existing: Pick<OccurrenceLike, "taskId" | "date">[],
  from: DateStr,
  to: DateStr,
): PlannedOccurrence[] {
  const have = new Set(existing.map((o) => `${o.taskId}|${o.date}`));
  const out: PlannedOccurrence[] = [];
  for (const date of dateRange(from, to)) {
    for (const task of tasks) {
      if (!taskAppliesOn(task, date)) continue;
      if (have.has(`${task.id}|${date}`)) continue;
      out.push({ taskId: task.id, date, title: task.title });
    }
  }
  return out;
}

/** Pending occurrences whose day is over (strictly before `today`). These expire. */
export function occurrencesToExpire<T extends OccurrenceLike>(
  occurrences: T[],
  today: DateStr,
): T[] {
  return occurrences.filter((o) => o.status === "pending" && o.date < today);
}

/**
 * Pending occurrences for `date` that no longer match the task's schedule
 * (task archived, recurrence changed). Done/expired ones are never returned.
 */
export function staleOccurrences<T extends OccurrenceLike>(
  tasks: TaskLike[],
  occurrences: T[],
  date: DateStr,
): T[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return occurrences.filter((o) => {
    if (o.date !== date || o.status !== "pending") return false;
    const task = byId.get(o.taskId);
    return !task || !taskAppliesOn(task, date);
  });
}
