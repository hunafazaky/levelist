import { useEffect, useState } from 'react'
import { db } from '../db/schema'
import { runCatchUp } from '../db/repo'
import { TasksScreen } from './TasksScreen'
import { TodayScreen } from './TodayScreen'
import { useToday } from './useToday'

type Tab = 'today' | 'tasks'

export function App() {
  const today = useToday()
  const [tab, setTab] = useState<Tab>('today')

  // Bring occurrences up to date whenever the day changes (including first load).
  useEffect(() => {
    void runCatchUp(db, today)
  }, [today])

  return (
    <div className="app">
      <main>
        {tab === 'today' ? (
          <TodayScreen today={today} onGoToTasks={() => setTab('tasks')} />
        ) : (
          <TasksScreen today={today} />
        )}
      </main>

      <nav className="nav" aria-label="Main">
        {(
          [
            ['today', 'Today'],
            ['tasks', 'Tasks'],
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
