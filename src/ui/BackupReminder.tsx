import { useLiveQuery } from "dexie-react-hooks";
import { backupReminderInfo, dismissBackupReminder } from "../db/backup";
import { db } from "../db/schema";
import { CONFIG } from "../domain/config";
import { toDateStr, type DateStr } from "../domain/dates";
import { backupReminder } from "../domain/reminder";
import { plural } from "./format";

/** A nudge on Today when the last backup is a week old, or there never was one. Gone after exporting or "Later". */
export function BackupReminder({
  today,
  onOpen,
}: {
  today: DateStr;
  onOpen: () => void;
}) {
  const info = useLiveQuery(() => backupReminderInfo(db), []);
  if (!info) return null;

  const reminder = backupReminder({
    today,
    lastExportDate:
      info.lastExportAt === undefined
        ? undefined
        : toDateStr(new Date(info.lastExportAt), CONFIG.dayStartHour),
    firstActivityDate: info.firstActivityDate,
    dismissedOn: info.dismissedOn,
  });
  if (!reminder.due) return null;

  return (
    <section className="notice" aria-label="Backup reminder">
      <p>
        {reminder.neverExported
          ? "You haven't made a backup yet. Export one so your progress survives if this device is lost or cleared."
          : `Your last backup was ${plural(reminder.days, "day")} ago.`}
      </p>
      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={onOpen}>
          Back up now
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void dismissBackupReminder(db, today)}
        >
          Later
        </button>
      </div>
    </section>
  );
}
