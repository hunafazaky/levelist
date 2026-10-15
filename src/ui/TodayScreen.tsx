import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/schema'
import { completeOccurrence } from '../db/repo'
import type { Occurrence } from '../db/types'
import type { DateStr } from '../domain/dates'
import { t } from '../i18n'
import { requestPersistence } from '../pwa/storage'
import { forecastDay, type DayForecast } from '../domain/streaks'
import { BackupReminder } from './BackupReminder'
import { formatDate } from './format'
import { ProofSheet } from './ProofSheet'
import { ProofThumb, ProofViewer } from './ProofImage'
import { useProgress } from './useProgress'

interface Props {
  today: DateStr
  onGoToTasks: () => void
  /** When given, the backup reminder can send the person to the Backup screen. */
  onGoToBackup?: () => void
}

const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`)

/** One plain sentence about what tonight's scoring will be, given how the day is going. */
function forecastText(f: DayForecast, done: number, total: number): string {
  if (done >= total) return t('Perfect day. {xp} XP bonus at midnight.', { xp: signed(f.xp) })
  if (done > 0)
    return t('Streak kept: {xp} XP at midnight. Finish everything for {perfect} XP instead.', {
      xp: signed(f.xp),
      perfect: signed(f.perfectXp),
    })
  return t('Finish one task to keep your streak and avoid {xp} XP at midnight.', { xp: signed(f.xp) })
}

export function TodayScreen({ today, onGoToTasks, onGoToBackup }: Props) {
  const [capturing, setCapturing] = useState<Occurrence | null>(null)
  const [viewing, setViewing] = useState<Occurrence | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const occurrences = useLiveQuery(() => db.occurrences.where('date').equals(today).toArray(), [today])
  const hasAnyTask = useLiveQuery(async () => (await db.tasks.filter((t) => t.archivedOn === undefined).count()) > 0, [])
  const data = useProgress()

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 2500)
    return () => window.clearTimeout(t)
  }, [flash])

  const items = [...(occurrences ?? [])].sort(
    (a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.title.localeCompare(b.title),
  )
  const doneCount = items.filter((o) => o.status === 'done').length

  const progress = data?.progress
  const forecast = data && items.length > 0 ? forecastDay(data.days, today, items.length, doneCount) : undefined
  // Show today's contribution as soon as it is secured; the perfect streak only once everything is done.
  const streak = forecast && doneCount > 0 ? forecast.streak : (progress?.streak ?? 0)
  const perfect = forecast && doneCount === items.length ? forecast.perfectRun : (progress?.perfectRun ?? 0)

  return (
    <>
      <header className="top">
        <div>
          <h1>{t('Today')}</h1>
          <p className="muted">{formatDate(today)}</p>
        </div>
        <div className="xp" aria-label={t('{xp} XP in total', { xp: progress?.totalXp ?? 0 })}>
          <span className="xp__value">{progress?.totalXp ?? 0}</span>
          <span className="xp__unit">XP</span>
        </div>
      </header>

      {onGoToBackup && <BackupReminder today={today} onOpen={onGoToBackup} />}

      <dl className="standing">
        <div>
          <dt>{t('Level')}</dt>
          <dd>{progress?.level.level ?? 0}</dd>
        </div>
        <div>
          <dt>{t('Day streak')}</dt>
          <dd>{streak}</dd>
        </div>
        <div>
          <dt>{t('Perfect streak')}</dt>
          <dd>{perfect}</dd>
        </div>
      </dl>

      <p className="flash" role="status" aria-live="polite">
        {flash}
      </p>

      {occurrences === undefined ? null : items.length === 0 ? (
        <section className="empty">
          {hasAnyTask ? (
            <>
              <h2>{t('Nothing scheduled today')}</h2>
              <p>{t('Enjoy the rest day. Your streak carries on.')}</p>
            </>
          ) : (
            <>
              <h2>{t('No tasks yet')}</h2>
              <p>{t('Add a task to start earning XP.')}</p>
              <button className="btn btn--primary" onClick={onGoToTasks}>
                {t('Add a task')}
              </button>
            </>
          )}
        </section>
      ) : (
        <>
          <p className="progress">
            {t('{done} of {total} done', { done: doneCount, total: items.length })}
          </p>
          <ul className="tasks">
            {items.map((o) => (
              <li key={o.id} className={o.status === 'done' ? 'row is-done' : 'row'}>
                <div className="row__text">
                  <span className="row__title">{o.title}</span>
                  <span className="row__meta">{o.status === 'done' ? t('Done') : t('Photo needed')}</span>
                </div>
                {o.status === 'done' ? (
                  o.proofId ? (
                    <ProofThumb proofId={o.proofId} label={o.title} onOpen={() => setViewing(o)} />
                  ) : (
                    // Finished tasks restored from a backup made without photos have nothing to show.
                    <span className="row__note">{t('No photo')}</span>
                  )
                ) : (
                  <button className="btn btn--primary" onClick={() => setCapturing(o)}>
                    {t('Add proof')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {forecast && <p className="forecast">{forecastText(forecast, doneCount, items.length)}</p>}
        </>
      )}

      {capturing && (
        <ProofSheet
          title={capturing.title}
          onConfirm={async (proof) => {
            const entry = await completeOccurrence(db, capturing.id, proof, today)
            setFlash(`+${entry.delta} XP`)
            // The person has something worth keeping now; ask the browser not to clear it. Never blocks or fails.
            void requestPersistence()
          }}
          onClose={() => setCapturing(null)}
        />
      )}
      {viewing?.proofId && (
        <ProofViewer proofId={viewing.proofId} title={viewing.title} onClose={() => setViewing(null)} />
      )}
    </>
  )
}
