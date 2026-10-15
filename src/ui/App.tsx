import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/schema'
import { t, useLang } from '../i18n'
import { useReminder } from '../reminders/useReminder'
import { runCatchUp } from '../db/repo'
import { BackupScreen } from './BackupScreen'
import { StatsScreen } from './StatsScreen'
import { TasksScreen } from './TasksScreen'
import { TodayScreen } from './TodayScreen'
import { ONBOARDED_KEY, Onboarding } from './Onboarding'
import { UpdateBanner } from './UpdateBanner'
import { useToday } from './useToday'

type Tab = 'today' | 'tasks' | 'stats' | 'backup'

export function App() {
  const lang = useLang()
  const today = useToday()
  useReminder(today)
  const [tab, setTab] = useState<Tab>('today')

  // Bring occurrences up to date whenever the day changes (including first load).
  useEffect(() => {
    void runCatchUp(db, today)
  }, [today])

  // Only someone who has never been welcomed and has nothing yet. Anyone with tasks (an older install) skips it.
  const needsWelcome = useLiveQuery(
    async () => (await db.meta.get(ONBOARDED_KEY)) === undefined && (await db.tasks.count()) === 0,
    [],
  )

  if (needsWelcome === undefined) return null
  if (needsWelcome) return <Onboarding key={lang} today={today} onDone={() => undefined} />

  return (
    <div className="app" key={lang}>
      <UpdateBanner />
      <main>
        {tab === 'today' && <TodayScreen today={today} onGoToTasks={() => setTab('tasks')} onGoToBackup={() => setTab('backup')} />}
        {tab === 'tasks' && <TasksScreen today={today} />}
        {tab === 'stats' && <StatsScreen today={today} />}
        {tab === 'backup' && <BackupScreen today={today} />}
      </main>

      <nav className="nav" aria-label={t('Main')}>
        {(
          [
            ['today', t('Today')],
            ['tasks', t('Tasks')],
            ['stats', t('Stats')],
            ['backup', t('Backup')],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? 'nav__item is-on' : 'nav__item'}
            aria-current={tab === value ? 'page' : undefined}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
