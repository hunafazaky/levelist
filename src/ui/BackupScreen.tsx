import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type FormEvent } from 'react'
import { BackupError, describeBackupError, inspectBackup, openBackupFile, createBackupFile, type BackupContents } from '../backup'
import { exportBackup, importBackup, lastExportedAt, markExported, type ImportMode } from '../db/backup'
import { db } from '../db/schema'
import { t } from '../i18n'
import type { DateStr } from '../domain/dates'
import { AboutCard } from './AboutCard'
import { AppCard } from './AppCard'
import { ReminderCard } from './ReminderCard'
import { ReportCard } from './ReportCard'
import { downloadBlob } from './download'
import { formatBytes, formatDateTime, plural } from './format'

const MIN_PASSWORD = 8

function ExportCard({ today }: { today: DateStr }) {
  const photos = useLiveQuery(async () => {
    const all = await db.proofs.toArray()
    return { count: all.length, bytes: all.reduce((n, p) => n + p.blob.size, 0) }
  }, [])
  const last = useLiveQuery(() => lastExportedAt(db), [])

  const [includePhotos, setIncludePhotos] = useState(true)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const encrypting = password !== ''
  const tooShort = encrypting && password.length < MIN_PASSWORD
  const mismatch = encrypting && repeat !== '' && repeat !== password
  const canExport = !busy && (!encrypting || (!tooShort && repeat === password))

  async function onExport(e: FormEvent) {
    e.preventDefault()
    if (!canExport) return
    setError(null)
    setSaved(null)
    setBusy(true)
    try {
      const contents = await exportBackup(db, { includePhotos })
      const file = await createBackupFile(contents, encrypting ? password : undefined)
      const name = `daily-quest-${today}.dqbackup`
      downloadBlob(file, name)
      await markExported(db)
      setSaved(name)
      setPassword('')
      setRepeat('')
    } catch (err) {
      setError(err instanceof Error
          ? t('Could not create the backup. {detail}', { detail: t(err.message) })
          : t('Could not create the backup.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={onExport} aria-labelledby="export-h">
      <h2 id="export-h">{t('Export')}</h2>
      <p className="muted">{t('Save your tasks, XP and photos to one file. Open it on another device with Import.')}</p>

      <div className="check">
        <input
          id="export-photos"
          type="checkbox"
          checked={includePhotos}
          onChange={(e) => setIncludePhotos(e.target.checked)}
          aria-describedby="export-photos-hint"
        />
        <div>
          <label htmlFor="export-photos">{t('Include photos')}</label>
          <span id="export-photos-hint" className="hint">
            {photos === undefined
              ? ''
              : photos.count === 0
                ? t('No photos yet.')
                : t('{photos}, about {size}.', { photos: plural(photos.count, 'photo'), size: formatBytes(photos.bytes) })}
          </span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="export-password">{t('Password (optional)')}</label>
        <input
          id="export-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-describedby="export-password-hint"
        />
        <span id="export-password-hint" className="hint">
          {t("Encrypts the file. If you forget the password, the backup can't be opened. Without a password, anyone who has the file can see your tasks and photos.")}
        </span>
      </div>

      {encrypting && (
        <div className="field">
          <label htmlFor="export-repeat">{t('Repeat password')}</label>
          <input
            id="export-repeat"
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      )}
      {tooShort && <p className="error">{t('Use at least {n} characters.', { n: MIN_PASSWORD })}</p>}
      {mismatch && !tooShort && <p className="error">{t("The passwords don't match.")}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={!canExport}>
          {busy ? t('Exporting…') : t('Export backup')}
        </button>
      </div>
      <p className="hint" role="status">
        {saved
          ? t('Saved {name}. Keep it somewhere safe.', { name: saved })
          : last
            ? t('Last export: {when}.', { when: formatDateTime(last) })
            : last === undefined
              ? t("You haven't exported yet.")
              : ''}
      </p>
    </form>
  )
}

type Stage =
  | { name: 'idle' }
  | { name: 'locked'; file: File }
  | { name: 'ready'; contents: BackupContents }
  | { name: 'done'; text: string }

function ImportCard({ today }: { today: DateStr }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>({ name: 'idle' })
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<ImportMode>('merge')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setStage({ name: 'idle' })
    setPassword('')
    setMode('merge')
    setConfirmReplace(false)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function open(file: File, pw?: string) {
    setError(null)
    setBusy(true)
    try {
      const { encrypted } = await inspectBackup(file)
      if (encrypted && pw === undefined) {
        setStage({ name: 'locked', file })
        return
      }
      setStage({ name: 'ready', contents: await openBackupFile(file, pw) })
      setPassword('')
    } catch (err) {
      setError(describeBackupError(err))
      // A wrong password keeps the unlock step open so it can be retried; anything else starts over.
      if (!(err instanceof BackupError && err.code === 'wrong-password')) setStage({ name: 'idle' })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function onUnlock(e: FormEvent) {
    e.preventDefault()
    if (stage.name === 'locked' && password !== '') await open(stage.file, password)
  }

  async function onImport() {
    if (stage.name !== 'ready') return
    if (mode === 'replace' && !confirmReplace) {
      setConfirmReplace(true)
      return
    }
    setError(null)
    setBusy(true)
    try {
      await importBackup(db, stage.contents, mode, today)
      const tasks = await db.tasks.filter((t) => t.archivedOn === undefined).count()
      const photos = await db.proofs.count()
      setStage({
        name: 'done',
        text: t('Imported. This device now has {tasks} and {photos}.', {
          tasks: plural(tasks, 'task'),
          photos: plural(photos, 'photo'),
        }),
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? t('The import failed and nothing was changed. {detail}', { detail: t(err.message) })
          : t('The import failed and nothing was changed.'),
      )
    } finally {
      setBusy(false)
      setConfirmReplace(false)
    }
  }

  const ready = stage.name === 'ready' ? stage.contents : null

  return (
    <section className="panel" aria-labelledby="import-h">
      <h2 id="import-h">{t('Import')}</h2>
      <p className="muted">{t('Open a backup file made with Export.')}</p>

      <input
        ref={inputRef}
        id="backup-file"
        type="file"
        className="visually-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            setStage({ name: 'idle' })
            setPassword('')
            void open(file)
          }
        }}
      />
      {(stage.name === 'idle' || stage.name === 'done') && (
        <div className="actions">
          <label htmlFor="backup-file" className="btn" aria-disabled={busy}>
            {busy ? t('Reading…') : t('Choose backup file')}
          </label>
        </div>
      )}

      {stage.name === 'locked' && (
        <form onSubmit={onUnlock} className="stack">
          <p>
            <strong>{stage.file.name}</strong> {t('is encrypted.')}
          </p>
          <div className="field">
            <label htmlFor="import-password">{t('Password')}</label>
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
            <button type="button" className="btn" onClick={reset} disabled={busy}>
              {t('Cancel')}
            </button>
            <span className="spacer" />
            <button type="submit" className="btn btn--primary" disabled={busy || password === ''}>
              {busy ? t('Unlocking…') : t('Unlock')}
            </button>
          </div>
        </form>
      )}

      {ready && (
        <div className="stack">
          <p>
            {t('Backup from {when}: {tasks}, {days} of history, {photos}.', {
              when: formatDateTime(ready.exportedAt),
              tasks: plural(ready.tasks.length, 'task'),
              days: plural(ready.days.length, 'day'),
              photos: plural(ready.proofs.length, 'photo'),
            })}
          </p>
          <fieldset className="field">
            <legend>{t('How to import')}</legend>
            <div className="choice">
              <input
                id="mode-merge"
                type="radio"
                name="mode"
                checked={mode === 'merge'}
                onChange={() => {
                  setMode('merge')
                  setConfirmReplace(false)
                }}
                aria-describedby="mode-merge-hint"
              />
              <div>
                <label htmlFor="mode-merge">{t('Merge with this device')}</label>
                <span id="mode-merge-hint" className="hint">
                  {t('Keeps what is here and adds what is new. A task finished on either device stays finished.')}
                </span>
              </div>
            </div>
            <div className="choice">
              <input
                id="mode-replace"
                type="radio"
                name="mode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
                aria-describedby="mode-replace-hint"
              />
              <div>
                <label htmlFor="mode-replace">{t('Replace this device')}</label>
                <span id="mode-replace-hint" className="hint">
                  {t('Deletes everything here and uses the file. Anything done after the backup was made is lost.')}
                </span>
              </div>
            </div>
          </fieldset>
          <div className="actions">
            <button type="button" className="btn" onClick={reset} disabled={busy}>
              {t('Cancel')}
            </button>
            <span className="spacer" />
            <button
              type="button"
              className={mode === 'replace' ? 'btn btn--danger-solid' : 'btn btn--primary'}
              onClick={onImport}
              disabled={busy}
            >
              {busy
                ? t('Importing…')
                : mode === 'merge'
                  ? t('Merge backup')
                  : confirmReplace
                    ? t('Yes, replace everything')
                    : t('Replace everything')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {stage.name === 'done' && (
        <p className="success" role="status">
          {stage.text}
        </p>
      )}
    </section>
  )
}

export function BackupScreen({ today }: { today: DateStr }) {
  return (
    <>
      <header className="top">
        <h1>{t('Backup')}</h1>
      </header>
      <ExportCard today={today} />
      <ImportCard today={today} />
      <ReminderCard />
      <AppCard />
      <AboutCard />
      <ReportCard />
    </>
  )
}
