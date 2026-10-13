import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Task } from "../db/types";
import { WEEKDAY_SHORT, type DateStr } from "../domain/dates";
import {
  nextOccurrenceDates,
  normalizeRecurrence,
  validateRecurrence,
  type Recurrence,
} from "../domain/recurrence";
import { formatRelative } from "./format";

type Kind = Recurrence["type"];

// Week shown Monday → Sunday; values follow the domain (0 = Sunday).
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface Props {
  task?: Task;
  today: DateStr;
  onSave: (input: { title: string; recurrence: Recurrence }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function initialKind(task?: Task): Kind {
  return task?.recurrence.type ?? "daily";
}

export function TaskForm({ task, today, onSave, onDelete, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(task?.title ?? "");
  const [kind, setKind] = useState<Kind>(initialKind(task));
  const [days, setDays] = useState<readonly number[]>(
    task?.recurrence.type === "weekdays" ? task.recurrence.days : [],
  );
  const [every, setEvery] = useState(
    task?.recurrence.type === "interval" ? task.recurrence.every : 2,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const anchor =
    task?.recurrence.type === "interval" ? task.recurrence.anchor : today;

  const recurrence: Recurrence = useMemo(() => {
    if (kind === "weekdays") return { type: "weekdays", days };
    if (kind === "interval") return { type: "interval", every, anchor };
    return { type: "daily" };
  }, [kind, days, every, anchor]);

  const recurrenceError = validateRecurrence(recurrence);
  const upcoming = useMemo(() => {
    if (recurrenceError) return [];
    const normalized = normalizeRecurrence(recurrence);
    return nextOccurrenceDates(
      { recurrence: normalized, createdOn: task?.createdOn ?? today },
      today,
      3,
    );
  }, [recurrence, recurrenceError, task?.createdOn, today]);

  function toggleDay(d: number) {
    setDays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d],
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSave({ title, recurrence });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the task.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete the task.",
      );
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      onClose={onClose}
      aria-labelledby="task-form-title"
    >
      <form onSubmit={submit} className="sheet__body">
        <h2 id="task-form-title">{task ? "Edit task" : "New task"}</h2>

        <label className="field">
          <span>Task</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Jogging"
            maxLength={120}
            autoFocus
            required
          />
        </label>

        <fieldset className="field">
          <legend>How often</legend>
          <div className="segmented" role="radiogroup">
            {(
              [
                ["daily", "Every day"],
                ["weekdays", "Weekdays"],
                ["interval", "Every N days"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={
                  kind === value ? "segmented__item is-on" : "segmented__item"
                }
              >
                <input
                  type="radio"
                  name="kind"
                  checked={kind === value}
                  onChange={() => setKind(value)}
                />
                {label}
              </label>
            ))}
          </div>

          {kind === "weekdays" && (
            <div className="daypicker">
              {WEEK_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(d)}
                  className={days.includes(d) ? "day is-on" : "day"}
                  onClick={() => toggleDay(d)}
                >
                  {WEEKDAY_SHORT[d]}
                </button>
              ))}
            </div>
          )}

          {kind === "interval" && (
            <label className="inline">
              Every
              <input
                type="number"
                min={2}
                max={365}
                value={every}
                onChange={(e) => setEvery(Number(e.target.value))}
                className="number"
              />
              days
            </label>
          )}
        </fieldset>

        <p className="hint" aria-live="polite">
          {recurrenceError ??
            (upcoming.length > 0
              ? `Next: ${upcoming.map((d) => formatRelative(d, today)).join(", ")}`
              : "")}
        </p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          {onDelete && (
            <button
              type="button"
              className="btn btn--danger"
              onClick={remove}
              disabled={busy}
            >
              {confirmDelete ? "Delete for good?" : "Delete"}
            </button>
          )}
          <span className="spacer" />
          <button
            type="button"
            className="btn"
            onClick={() => dialogRef.current?.close()}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy || recurrenceError !== null}
          >
            {task ? "Save changes" : "Add task"}
          </button>
        </div>
        {confirmDelete && (
          <p className="hint">
            Past results stay in your history. The task stops appearing from
            today.
          </p>
        )}
      </form>
    </dialog>
  );
}
