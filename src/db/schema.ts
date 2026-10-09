import Dexie, { type Table } from 'dexie'
import type { LedgerEntry, MetaRow, Occurrence, Proof, Task } from './types'

export class QuestDB extends Dexie {
  tasks!: Table<Task, string>
  occurrences!: Table<Occurrence, string>
  meta!: Table<MetaRow, string>
  proofs!: Table<Proof, string>
  ledger!: Table<LedgerEntry, string>

  constructor(name = 'daily-quest') {
    super(name)
    this.version(1).stores({
      tasks: 'id, archivedOn',
      occurrences: 'id, taskId, date, status',
      meta: 'key',
    })
    this.version(2).stores({
      proofs: 'id',
      ledger: 'id, date, kind',
    })
  }
}

export const db = new QuestDB()
