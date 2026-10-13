import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../db/schema";
import { archiveTask, createTask, updateTask } from "../db/repo";
import type { Task } from "../db/types";
import type { DateStr } from "../domain/dates";
import { describeRecurrence, nextOccurrenceDates } from "../domain/recurrence";
import { formatRelative } from "./format";
import { TaskForm } from "./TaskForm";

type Editing = { mode: "new" } | { mode: "edit"; task: Task } | null;

export function TasksScreen({ today }: { today: DateStr }) {
  const [editing, setEditing] = useState<Editing>(null);
  const tasks = useLiveQuery(
    () =>
      db.tasks.filter((t) => t.archivedOn === undefined).sortBy("createdAt"),
    [],
  );

  return (
    <>
      <header className="top">
        <h1>Tasks</h1>
        <button
          className="btn btn--primary"
          onClick={() => setEditing({ mode: "new" })}
        >
          Add task
        </button>
      </header>

      {tasks === undefined ? null : tasks.length === 0 ? (
        <section className="empty">
          <h2>No tasks yet</h2>
          <p>
            Add something you want to do regularly, like jogging every Sunday or
            reading every day.
          </p>
          <button
            className="btn btn--primary"
            onClick={() => setEditing({ mode: "new" })}
          >
            Add your first task
          </button>
        </section>
      ) : (
        <ul className="tasks">
          {tasks.map((task) => {
            const [next] = nextOccurrenceDates(task, today, 1);
            return (
              <li key={task.id}>
                <button
                  className="task"
                  onClick={() => setEditing({ mode: "edit", task })}
                >
                  <span className="task__title">{task.title}</span>
                  <span className="task__meta">
                    {describeRecurrence(task.recurrence)}
                  </span>
                  <span
                    className={
                      next === today ? "task__next is-today" : "task__next"
                    }
                  >
                    {next ? formatRelative(next, today) : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <TaskForm
          key={editing.mode === "edit" ? editing.task.id : "new"}
          task={editing.mode === "edit" ? editing.task : undefined}
          today={today}
          onSave={async (input) => {
            if (editing.mode === "edit")
              await updateTask(db, editing.task.id, input, today);
            else await createTask(db, input, today);
          }}
          onDelete={
            editing.mode === "edit"
              ? () => archiveTask(db, editing.task.id, today)
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
