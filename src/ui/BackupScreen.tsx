import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState, type FormEvent } from "react";
import {
  BackupError,
  describeBackupError,
  inspectBackup,
  openBackupFile,
  createBackupFile,
  type BackupContents,
} from "../backup";
import {
  exportBackup,
  importBackup,
  lastExportedAt,
  markExported,
  type ImportMode,
} from "../db/backup";
import { db } from "../db/schema";
import type { DateStr } from "../domain/dates";
import { AppCard } from "./AppCard";
import { downloadBlob } from "./download";
import { formatBytes, formatDateTime, plural } from "./format";

const MIN_PASSWORD = 8;

function ExportCard({ today }: { today: DateStr }) {
  const photos = useLiveQuery(async () => {
    const all = await db.proofs.toArray();
    return {
      count: all.length,
      bytes: all.reduce((n, p) => n + p.blob.size, 0),
    };
  }, []);
  const last = useLiveQuery(() => lastExportedAt(db), []);

  const [includePhotos, setIncludePhotos] = useState(true);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const encrypting = password !== "";
  const tooShort = encrypting && password.length < MIN_PASSWORD;
  const mismatch = encrypting && repeat !== "" && repeat !== password;
  const canExport =
    !busy && (!encrypting || (!tooShort && repeat === password));

  async function onExport(e: FormEvent) {
    e.preventDefault();
    if (!canExport) return;
    setError(null);
    setSaved(null);
    setBusy(true);
    try {
      const contents = await exportBackup(db, { includePhotos });
      const file = await createBackupFile(
        contents,
        encrypting ? password : undefined,
      );
      const name = `daily-quest-${today}.dqbackup`;
      downloadBlob(file, name);
      await markExported(db);
      setSaved(name);
      setPassword("");
      setRepeat("");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not create the backup. ${err.message}`
          : "Could not create the backup.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={onExport} aria-labelledby="export-h">
      <h2 id="export-h">Export</h2>
      <p className="muted">
        Save your tasks, XP and photos to one file. Open it on another device
        with Import.
      </p>

      <div className="check">
        <input
          id="export-photos"
          type="checkbox"
          checked={includePhotos}
          onChange={(e) => setIncludePhotos(e.target.checked)}
          aria-describedby="export-photos-hint"
        />
        <div>
          <label htmlFor="export-photos">Include photos</label>
          <span id="export-photos-hint" className="hint">
            {photos === undefined
              ? ""
              : photos.count === 0
                ? "No photos yet."
                : `${plural(photos.count, "photo")}, about ${formatBytes(photos.bytes)}.`}
          </span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="export-password">Password (optional)</label>
        <input
          id="export-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-describedby="export-password-hint"
        />
        <span id="export-password-hint" className="hint">
          Encrypts the file. If you forget the password, the backup can&apos;t
          be opened. Without a password, anyone who has the file can see your
          tasks and photos.
        </span>
      </div>

      {encrypting && (
        <div className="field">
          <label htmlFor="export-repeat">Repeat password</label>
          <input
            id="export-repeat"
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      )}
      {tooShort && (
        <p className="error">Use at least {MIN_PASSWORD} characters.</p>
      )}
      {mismatch && !tooShort && (
        <p className="error">The passwords don&apos;t match.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={!canExport}
        >
          {busy ? "Exporting…" : "Export backup"}
        </button>
      </div>
      <p className="hint" role="status">
        {saved
          ? `Saved ${saved}. Keep it somewhere safe.`
          : last
            ? `Last export: ${formatDateTime(last)}.`
            : last === undefined
              ? "You haven't exported yet."
              : ""}
      </p>
    </form>
  );
}

type Stage =
  | { name: "idle" }
  | { name: "locked"; file: File }
  | { name: "ready"; contents: BackupContents }
  | { name: "done"; text: string };

function ImportCard({ today }: { today: DateStr }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStage({ name: "idle" });
    setPassword("");
    setMode("merge");
    setConfirmReplace(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function open(file: File, pw?: string) {
    setError(null);
    setBusy(true);
    try {
      const { encrypted } = await inspectBackup(file);
      if (encrypted && pw === undefined) {
        setStage({ name: "locked", file });
        return;
      }
      setStage({ name: "ready", contents: await openBackupFile(file, pw) });
      setPassword("");
    } catch (err) {
      setError(describeBackupError(err));
      // A wrong password keeps the unlock step open so it can be retried; anything else starts over.
      if (!(err instanceof BackupError && err.code === "wrong-password"))
        setStage({ name: "idle" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    if (stage.name === "locked" && password !== "")
      await open(stage.file, password);
  }

  async function onImport() {
    if (stage.name !== "ready") return;
    if (mode === "replace" && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await importBackup(db, stage.contents, mode, today);
      const tasks = await db.tasks
        .filter((t) => t.archivedOn === undefined)
        .count();
      const photos = await db.proofs.count();
      setStage({
        name: "done",
        text: `Imported. This device now has ${plural(tasks, "task")} and ${plural(photos, "photo")}.`,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? `The import failed and nothing was changed. ${err.message}`
          : "The import failed and nothing was changed.",
      );
    } finally {
      setBusy(false);
      setConfirmReplace(false);
    }
  }

  const ready = stage.name === "ready" ? stage.contents : null;

  return (
    <section className="panel" aria-labelledby="import-h">
      <h2 id="import-h">Import</h2>
      <p className="muted">Open a backup file made with Export.</p>

      <input
        ref={inputRef}
        id="backup-file"
        type="file"
        className="visually-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setStage({ name: "idle" });
            setPassword("");
            void open(file);
          }
        }}
      />
      {(stage.name === "idle" || stage.name === "done") && (
        <div className="actions">
          <label htmlFor="backup-file" className="btn" aria-disabled={busy}>
            {busy ? "Reading…" : "Choose backup file"}
          </label>
        </div>
      )}

      {stage.name === "locked" && (
        <form onSubmit={onUnlock} className="stack">
          <p>
            <strong>{stage.file.name}</strong> is encrypted.
          </p>
          <div className="field">
            <label htmlFor="import-password">Password</label>
            <input
              id="import-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={reset}
              disabled={busy}
            >
              Cancel
            </button>
            <span className="spacer" />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy || password === ""}
            >
              {busy ? "Unlocking…" : "Unlock"}
            </button>
          </div>
        </form>
      )}

      {ready && (
        <div className="stack">
          <p>
            Backup from {formatDateTime(ready.exportedAt)}:{" "}
            {plural(ready.tasks.length, "task")},{" "}
            {plural(ready.days.length, "day")} of history,{" "}
            {plural(ready.proofs.length, "photo")}.
          </p>
          <fieldset className="field">
            <legend>How to import</legend>
            <div className="choice">
              <input
                id="mode-merge"
                type="radio"
                name="mode"
                checked={mode === "merge"}
                onChange={() => {
                  setMode("merge");
                  setConfirmReplace(false);
                }}
                aria-describedby="mode-merge-hint"
              />
              <div>
                <label htmlFor="mode-merge">Merge with this device</label>
                <span id="mode-merge-hint" className="hint">
                  Keeps what is here and adds what is new. A task finished on
                  either device stays finished.
                </span>
              </div>
            </div>
            <div className="choice">
              <input
                id="mode-replace"
                type="radio"
                name="mode"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
                aria-describedby="mode-replace-hint"
              />
              <div>
                <label htmlFor="mode-replace">Replace this device</label>
                <span id="mode-replace-hint" className="hint">
                  Deletes everything here and uses the file. Anything done after
                  the backup was made is lost.
                </span>
              </div>
            </div>
          </fieldset>
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={reset}
              disabled={busy}
            >
              Cancel
            </button>
            <span className="spacer" />
            <button
              type="button"
              className={
                mode === "replace"
                  ? "btn btn--danger-solid"
                  : "btn btn--primary"
              }
              onClick={onImport}
              disabled={busy}
            >
              {busy
                ? "Importing…"
                : mode === "merge"
                  ? "Merge backup"
                  : confirmReplace
                    ? "Yes, replace everything"
                    : "Replace everything"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {stage.name === "done" && (
        <p className="success" role="status">
          {stage.text}
        </p>
      )}
    </section>
  );
}

export function BackupScreen({ today }: { today: DateStr }) {
  return (
    <>
      <header className="top">
        <h1>Backup</h1>
      </header>
      <ExportCard today={today} />
      <ImportCard today={today} />
      <AppCard />
    </>
  );
}
