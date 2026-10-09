import Dexie, { type Table } from 'dexie'
import type { MetaRow, Occurrence, Task } from './types'

export class QuestDB extends Dexie {
  tasks!: Table<Task, string>
  occurrences!: Table<Occurrence, string>
  meta!: Table<MetaRow, string>

  constructor(name = 'daily-quest') {
    super(name)
    this.version(1).stores({
      tasks: 'id, archivedOn',
      occurrences: 'id, taskId, date, status',
      meta: 'key',
    })
  }
}

export const db = new QuestDB()
