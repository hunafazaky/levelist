import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/schema'
import { completeOccurrence } from '../db/repo'
import type { Occurrence } from '../db/types'
import type { DateStr } from '../domain/dates'
import { totalXp } from '../domain/xp'
import { formatDate } from './format'
import { ProofSheet } from './ProofSheet'
import { ProofThumb, ProofViewer } from './ProofImage'

interface Props {
  today: DateStr
  onGoToTasks: () => void
}

export function TodayScreen({ today, onGoToTasks }: Props) {
  const [capturing, setCapturing] = useState<Occurrence | null>(null)
  const [viewing, setViewing] = useState<Occurrence | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const occurrences = useLiveQuery(() => db.occurrences.where('date').equals(today).toArray(), [today])
  const hasAnyTask = useLiveQuery(async () => (await db.tasks.filter((t) => t.archivedOn === undefined).count()) > 0, [])
  const xp = useLiveQuery(async () => {
    const rows = await db.ledger.toArray()
    rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    return totalXp(rows.map((r) => r.delta))
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 2500)
    return () => window.clearTimeout(t)
  }, [flash])

  const items = [...(occurrences ?? [])].sort(
    (a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.title.localeCompare(b.title),
  )
  const doneCount = items.filter((o) => o.status === 'done').length

  return (
    <>
      <header className="top">
        <div>
          <h1>Today</h1>
          <p className="muted">{formatDate(today)}</p>
        </div>
        <div className="xp" aria-label={`${xp ?? 0} XP in total`}>
          <span className="xp__value">{xp ?? 0}</span>
          <span className="xp__unit">XP</span>
        </div>
      </header>

      <p className="flash" role="status" aria-live="polite">
        {flash}
      </p>

      {occurrences === undefined ? null : items.length === 0 ? (
        <section className="empty">
          {hasAnyTask ? (
            <>
              <h2>Nothing scheduled today</h2>
              <p>Enjoy the rest day. Your streak carries on.</p>
            </>
          ) : (
            <>
              <h2>No tasks yet</h2>
              <p>Add a task to start earning XP.</p>
              <button className="btn btn--primary" onClick={onGoToTasks}>
                Add a task
              </button>
            </>
          )}
        </section>
      ) : (
        <>
          <p className="progress">
            {doneCount} of {items.length} done
          </p>
          <ul className="tasks">
            {items.map((o) => (
              <li key={o.id} className={o.status === 'done' ? 'row is-done' : 'row'}>
                <div className="row__text">
                  <span className="row__title">{o.title}</span>
                  <span className="row__meta">{o.status === 'done' ? 'Done' : 'Photo needed'}</span>
                </div>
                {o.status === 'done' && o.proofId ? (
                  <ProofThumb proofId={o.proofId} label={o.title} onOpen={() => setViewing(o)} />
                ) : (
                  <button className="btn btn--primary" onClick={() => setCapturing(o)}>
                    Add proof
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {capturing && (
        <ProofSheet
          title={capturing.title}
          onConfirm={async (proof) => {
            const entry = await completeOccurrence(db, capturing.id, proof, today)
            setFlash(`+${entry.delta} XP`)
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
