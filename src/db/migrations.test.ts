import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { runCatchUp } from './repo'
import { QuestDB } from './schema'

/**
 * Past versions of the database, written out literally. A person's device can be on any of them when a new
 * version of the app opens it, so each must upgrade without losing anything. When the schema changes, add the
 * new version to schema.ts, and add its predecessor here if it isn't already. Never edit an old version.
 */
const HISTORY = {
  1: { tasks: 'id, archivedOn', occurrences: 'id, taskId, date, status', meta: 'key' },
  2: {
    tasks: 'id, archivedOn',
    occurrences: 'id, taskId, date, status',
    meta: 'key',
    proofs: 'id',
    ledger: 'id, date, kind',
  },
} as const

let n = 0
const name = () => `migration-${n++}`

async function seed(version: 1 | 2, dbName: string, rows: Record<string, object[]>) {
  const old = new Dexie(dbName)
  for (const v of [1, 2] as const) if (v <= version) old.version(v).stores(HISTORY[v])
  await old.open()
  for (const [table, items] of Object.entries(rows)) await old.table(table).bulkAdd(items)
  old.close()
}

const task = {
  id: 'task-1',
  title: 'Jogging',
  recurrence: { type: 'daily' },
  createdOn: '2026-10-01',
  createdAt: 1,
  updatedAt: 1,
}
const occ = (date: string, status: string) => ({
  id: `task-1_${date}`,
  taskId: 'task-1',
  date,
  title: 'Jogging',
  status,
})

describe('database upgrades', () => {
  it('upgrades a version 1 database and keeps its tasks and days', async () => {
    const dbName = name()
    await seed(1, dbName, {
      tasks: [task],
      occurrences: [occ('2026-10-01', 'expired'), occ('2026-10-02', 'pending')],
      meta: [{ key: 'lastCatchUpDate', value: '2026-10-02' }],
    })

    const db = new QuestDB(dbName)
    await db.open()
    expect((await db.tasks.get('task-1'))?.title).toBe('Jogging')
    expect(await db.occurrences.count()).toBe(2)
    expect((await db.meta.get('lastCatchUpDate'))?.value).toBe('2026-10-02')
    // The tables added later exist and work.
    expect(await db.proofs.count()).toBe(0)
    expect(await db.ledger.count()).toBe(0)
    expect(await db.days.count()).toBe(0)

    // And the app's own startup job runs on top of old data: the missed day from version 1 gets scored.
    await runCatchUp(db, '2026-10-04')
    expect((await db.days.get('2026-10-01'))?.outcome).toBe('broken')
    db.close()
  })

  it('upgrades a version 2 database and keeps its XP and photos', async () => {
    const dbName = name()
    await seed(2, dbName, {
      tasks: [task],
      occurrences: [{ ...occ('2026-10-01', 'done'), proofId: 'p1', completedAt: 5 }],
      proofs: [{ id: 'p1', blob: new Blob(['x'], { type: 'image/webp' }), mime: 'image/webp', createdAt: 5 }],
      ledger: [{ id: 'task_complete_task-1_2026-10-01', date: '2026-10-01', kind: 'task_complete', delta: 100, refId: 'task-1_2026-10-01', createdAt: 5 }],
      meta: [{ key: 'lastCatchUpDate', value: '2026-10-01' }],
    })

    const db = new QuestDB(dbName)
    await db.open()
    expect((await db.proofs.get('p1'))?.mime).toBe('image/webp')
    expect((await db.ledger.toArray()).map((e) => e.delta)).toEqual([100])
    expect(await db.days.count()).toBe(0)

    await runCatchUp(db, '2026-10-03')
    expect((await db.days.get('2026-10-01'))?.outcome).toBe('perfect')
    // Finishing the migration did not duplicate or lose the XP already earned.
    expect((await db.ledger.where('kind').equals('task_complete').toArray()).length).toBe(1)
    db.close()
  })

  it('opens a database made by a newer version of the app and leaves it alone', async () => {
    // Happens when an old copy of the app (a stale tab or cached worker) meets data a newer copy upgraded.
    // Dexie 4 opens it as it is instead of failing, so the old app keeps working and nothing is rewritten.
    const dbName = name()
    const future = new Dexie(dbName)
    future.version(30).stores({ ...HISTORY[2], days: 'date', somethingNew: 'id' })
    await future.open()
    await future.table('tasks').add(task)
    await future.table('somethingNew').add({ id: 'x' })
    future.close()

    const db = new QuestDB(dbName)
    await db.open()
    expect((await db.tasks.get('task-1'))?.title).toBe('Jogging')
    db.close()

    const check = new Dexie(dbName)
    await check.open()
    expect(check.verno).toBe(30)
    expect(await check.table('somethingNew').count()).toBe(1)
    check.close()
  })
})
