import { diffDays, type DateStr } from "./dates";

/** Days after which a backup reminder appears. */
export const REMINDER_AFTER_DAYS = 7;

export interface ReminderInput {
  today: DateStr;
  /** The day of the last export, if there has been one. */
  lastExportDate?: DateStr;
  /** The first day anything was earned. Until then there is nothing worth saving. */
  firstActivityDate?: DateStr;
  /** The day the person tapped "Later". The reminder stays away for the rest of that day. */
  dismissedOn?: DateStr;
}

export interface Reminder {
  due: boolean;
  neverExported: boolean;
  /** Days since the last export, or since the first activity when there has been no export. */
  days: number;
}

/** Whether to nudge the person to export a backup. */
export function backupReminder({
  today,
  lastExportDate,
  firstActivityDate,
  dismissedOn,
}: ReminderInput): Reminder {
  const neverExported = lastExportDate === undefined;
  const baseline = lastExportDate ?? firstActivityDate;
  if (baseline === undefined) return { due: false, neverExported, days: 0 };
  const days = Math.max(0, diffDays(baseline, today));
  return {
    due: days >= REMINDER_AFTER_DAYS && dismissedOn !== today,
    neverExported,
    days,
  };
}
