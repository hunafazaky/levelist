import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/schema'
import { archiveTask, createTask, runCatchUp, updateTask } from '../db/repo'
import type { Task } from '../db/types'
import { describeRecurrence, nextOccurrenceDates } from '../domain/recurrence'
import { formatDate, formatRelative } from './format'
import { TaskForm } from './TaskForm'
import { useToday } from './useToday'

type Editing = { mode: 'new' } | { mode: 'edit'; task: Task } | null

export function App() {
  const today = useToday()
  const [editing, setEditing] = useState<Editing>(null)

  // Bring occurrences up to date whenever the day changes (including first load).
  useEffect(() => {
    void runCatchUp(db, today)
  }, [today])

  const tasks = useLiveQuery(
    () => db.tasks.filter((t) => t.archivedOn === undefined).sortBy('createdAt'),
    [],
  )

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Tasks</h1>
          <p className="muted">{formatDate(today)}</p>
        </div>
        <button className="btn btn--primary" onClick={() => setEditing({ mode: 'new' })}>
          Add task
        </button>
      </header>

      <main>
        {tasks === undefined ? null : tasks.length === 0 ? (
          <section className="empty">
            <h2>No tasks yet</h2>
            <p>Add something you want to do regularly, like jogging every Sunday or reading every day.</p>
            <button className="btn btn--primary" onClick={() => setEditing({ mode: 'new' })}>
              Add your first task
            </button>
          </section>
        ) : (
          <ul className="tasks">
            {tasks.map((task) => {
              const [next] = nextOccurrenceDates(task, today, 1)
              return (
                <li key={task.id}>
                  <button className="task" onClick={() => setEditing({ mode: 'edit', task })}>
                    <span className="task__title">{task.title}</span>
                    <span className="task__meta">{describeRecurrence(task.recurrence)}</span>
                    <span className={next === today ? 'task__next is-today' : 'task__next'}>
                      {next ? formatRelative(next, today) : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {editing && (
        <TaskForm
          key={editing.mode === 'edit' ? editing.task.id : 'new'}
          task={editing.mode === 'edit' ? editing.task : undefined}
          today={today}
          onSave={async (input) => {
            if (editing.mode === 'edit') await updateTask(db, editing.task.id, input, today)
            else await createTask(db, input, today)
          }}
          onDelete={editing.mode === 'edit' ? () => archiveTask(db, editing.task.id, today) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
