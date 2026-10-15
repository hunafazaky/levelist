import { useMemo } from 'react'
import type { DateStr } from '../domain/dates'
import { diffDays } from '../domain/dates'
import type { DayOutcome } from '../domain/days'
import { buildCalendar } from '../domain/calendar'
import { t } from '../i18n'
import { formatDate } from './format'
import { achievementText, weekdayName } from './text'
import { useProgress } from './useProgress'

const WEEKS = 12
const NEW_FOR_DAYS = 3

const outcomeLabel = (o: DayOutcome): string =>
  ({
    perfect: t('Perfect day'),
    streak: t('Streak day'),
    broken: t('Missed day'),
    rest: t('Rest day'),
    paused: t('No tasks yet'),
  })[o]

export function StatsScreen({ today }: { today: DateStr }) {
  const data = useProgress()

  const grid = useMemo(
    () => buildCalendar(today, WEEKS, new Map((data?.days ?? []).map((d) => [d.date, d.outcome]))),
    [today, data?.days],
  )

  if (!data) return null
  const { progress } = data
  const { level } = progress

  const counts = { perfect: 0, streak: 0, broken: 0, rest: 0 }
  for (const cell of grid.flat()) {
    if (cell.outcome && cell.outcome !== 'paused') counts[cell.outcome]++
  }

  const unlocked = progress.achievements
    .filter((a) => a.unlockedOn !== undefined)
    .sort((a, b) => (a.unlockedOn! < b.unlockedOn! ? 1 : a.unlockedOn! > b.unlockedOn! ? -1 : 0))
  const locked = progress.achievements.filter((a) => a.unlockedOn === undefined)

  return (
    <>
      <header className="top">
        <h1>{t('Stats')}</h1>
      </header>

      <section className="panel" aria-labelledby="level-h">
        <h2 id="level-h">{t('Level {n}', { n: level.level })}</h2>
        <progress className="bar" max={level.xpForNext} value={level.xpIntoLevel} aria-labelledby="level-h" />
        <p className="muted">
          {t('{into} of {need} XP to level {next}. Total {total} XP.', {
            into: level.xpIntoLevel,
            need: level.xpForNext,
            next: level.level + 1,
            total: progress.totalXp,
          })}
        </p>
      </section>

      <section className="panel" aria-labelledby="streak-h">
        <h2 id="streak-h">{t('Streaks')}</h2>
        <dl className="figures">
          <div>
            <dt>{t('Streak now')}</dt>
            <dd>{progress.streak}</dd>
          </div>
          <div>
            <dt>{t('Best streak')}</dt>
            <dd>{progress.bestStreak}</dd>
          </div>
          <div>
            <dt>{t('Perfect now')}</dt>
            <dd>{progress.perfectRun}</dd>
          </div>
          <div>
            <dt>{t('Best perfect')}</dt>
            <dd>{progress.bestPerfectRun}</dd>
          </div>
        </dl>
        <p className="muted">{t('Counted in days, up to yesterday.')}</p>
      </section>

      <section className="panel" aria-labelledby="cal-h">
        <h2 id="cal-h">{t('Last {n} weeks', { n: WEEKS })}</h2>
        <p className="muted">
          {t('{perfect} perfect, {streak} streak, {missed} missed, {rest} rest.', {
            perfect: counts.perfect,
            streak: counts.streak,
            missed: counts.broken,
            rest: counts.rest,
          })}
        </p>
        <div className="cal" role="group" aria-label={t('Day by day results, Monday to Sunday')}>
          <div className="cal__head" aria-hidden="true">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <span key={d}>{weekdayName(d).charAt(0)}</span>
            ))}
          </div>
          {grid.map((week) => (
            <ol key={week[0].date} className="cal__week">
              {week.map((cell) => {
                const label = cell.isFuture
                  ? `${formatDate(cell.date)}: ${t('upcoming')}`
                  : cell.isToday
                    ? `${formatDate(cell.date)}: ${t('today, still in progress')}`
                    : `${formatDate(cell.date)}: ${cell.outcome ? outcomeLabel(cell.outcome) : t('no result')}`
                return (
                  <li
                    key={cell.date}
                    className={[
                      'cal__cell',
                      cell.outcome && !cell.isToday ? `is-${cell.outcome}` : '',
                      cell.isToday ? 'is-today' : '',
                      cell.isFuture ? 'is-future' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={label}
                    title={label}
                  >
                    {Number(cell.date.slice(8))}
                  </li>
                )
              })}
            </ol>
          ))}
        </div>
        <ul className="legend">
          <li>
            <span className="cal__cell is-perfect" aria-hidden="true" /> {t('Perfect')}
          </li>
          <li>
            <span className="cal__cell is-streak" aria-hidden="true" /> {t('Streak')}
          </li>
          <li>
            <span className="cal__cell is-broken" aria-hidden="true" /> {t('Missed')}
          </li>
          <li>
            <span className="cal__cell is-rest" aria-hidden="true" /> {t('Rest')}
          </li>
        </ul>
      </section>

      <section aria-labelledby="ach-h">
        <h2 id="ach-h" className="section-title">
          {t('Achievements')}
        </h2>
        <p className="muted achievements-count">
          {t('{done} of {total} unlocked', { done: unlocked.length, total: progress.achievements.length })}
        </p>
        <ul className="tasks">
          {[...unlocked, ...locked].map((a) => {
            const text = achievementText(a)
            const isNew = a.unlockedOn !== undefined && diffDays(a.unlockedOn, today) <= NEW_FOR_DAYS
            return (
              <li key={a.id} className={a.unlockedOn ? 'ach is-unlocked' : 'ach'}>
                <div className="ach__text">
                  <span className="ach__title">
                    {text.title}
                    {isNew && <span className="tag">{t('New')}</span>}
                  </span>
                  <span className="ach__desc">{text.description}</span>
                </div>
                <span className="ach__status">{a.unlockedOn ? formatDate(a.unlockedOn) : t('Locked')}</span>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
