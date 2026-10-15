import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createBackupFile, openBackupFile, type BackupContents } from '../backup'
import { exportBackup, importBackup, lastExportedAt, markExported } from './backup'
import { archiveTask, completeOccurrence, createTask, runCatchUp, updateTask } from './repo'
import { QuestDB } from './schema'

let n = 0
const fresh = async () => {
  const db = new QuestDB(`backup-test-${n++}`)
  await db.open()
  return db
}
const photo = (text: string) => ({ blob: new Blob([text], { type: 'image/webp' }), mime: 'image/webp' })
const NOW = 1_759_000_000_000

/** Plain data for comparing two databases, without timestamps that legitimately differ. */
async function snapshot(db: QuestDB) {
  const by = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
  return {
    tasks: by(await db.tasks.toArray()),
    occurrences: by(await db.occurrences.toArray()),
    ledger: by(await db.ledger.toArray()).map(({ createdAt: _c, ...rest }) => rest),
    days: await db.days.orderBy('date').toArray(),
    proofs: await Promise.all(
      by(await db.proofs.toArray()).map(async (p) => ({ id: p.id, mime: p.mime, text: await p.blob.text() })),
    ),
    meta: (await db.meta.toArray()).filter((m) => m.key !== 'lastExportAt').sort((a, b) => a.key.localeCompare(b.key)),
  }
}

async function throughFile(contents: BackupContents, password?: string): Promise<BackupContents> {
  const file = await createBackupFile(contents, password, { iterations: 1000, chunkBytes: 256 })
  return openBackupFile(file, password)
}

/** A with one daily task, Oct 1 finished with a photo and scored, now on Oct 2. */
async function deviceA() {
  const a = await fresh()
  const task = await createTask(a, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01', NOW)
  await runCatchUp(a, '2026-10-01', NOW)
  await completeOccurrence(a, `${task.id}_2026-10-01`, photo('PHOTO-A1'), '2026-10-01', NOW)
  await runCatchUp(a, '2026-10-02', NOW)
  return { a, task }
}

describe('exportBackup', () => {
  it('exports everything, only the backup meta keys, and never the export time', async () => {
    const { a } = await deviceA()
    await markExported(a, 123)
    const c = await exportBackup(a, { now: 42 })
    expect(c.exportedAt).toBe(42)
    expect(c.tasks).toHaveLength(1)
    expect(c.occurrences).toHaveLength(2)
    expect(c.proofs).toHaveLength(1)
    expect(c.days.map((d) => d.outcome)).toEqual(['perfect'])
    expect(Object.keys(c.meta).sort()).toEqual(['lastCatchUpDate', 'lastFinalizedDate'])
    expect(await lastExportedAt(a)).toBe(123)
  })

  it('can leave photos out and drops the references to them', async () => {
    const { a } = await deviceA()
    const c = await exportBackup(a, { includePhotos: false })
    expect(c.proofs).toEqual([])
    expect(c.occurrences.every((o) => o.proofId === undefined)).toBe(true)
    expect(c.occurrences.find((o) => o.status === 'done')).toBeTruthy()
    // the file must still be valid
    await throughFile(c)
  })
})

describe('replace', () => {
  it.each([[undefined], ['a good password']])('makes the device a copy of the backup (password: %s)', async (password) => {
    const { a } = await deviceA()
    const b = await fresh()
    await createTask(b, { title: 'Old junk', recurrence: { type: 'daily' } }, '2026-09-01', NOW)
    await completeOccurrence(b, (await b.occurrences.toCollection().first())!.id, photo('JUNK'), '2026-09-01', NOW).catch(
      () => {},
    )

    const contents = await throughFile(await exportBackup(a, { now: NOW }), password)
    const summary = await importBackup(b, contents, 'replace', '2026-10-02', NOW)

    expect(summary).toMatchObject({ mode: 'replace', tasksAdded: 1, photosAdded: 1 })
    expect(await snapshot(b)).toEqual(await snapshot(a))
    expect((await b.tasks.toArray()).map((t) => t.title)).toEqual(['Read'])
    expect(await b.proofs.count()).toBe(1)
  })

  it('keeps the device-local export time', async () => {
    const { a } = await deviceA()
    const b = await fresh()
    await markExported(b, 777)
    await importBackup(b, await exportBackup(a), 'replace', '2026-10-02')
    expect(await lastExportedAt(b)).toBe(777)
  })

  it('scores the days since the backup was made, once', async () => {
    const { a } = await deviceA()
    const b = await fresh()
    await importBackup(b, await throughFile(await exportBackup(a, { now: NOW })), 'replace', '2026-10-05', NOW)
    // Oct 2 and Oct 3, Oct 4 had a daily task, nothing done: missed
    expect((await b.days.orderBy('date').toArray()).map((d) => `${d.date}:${d.outcome}`)).toEqual([
      '2026-10-01:perfect',
      '2026-10-02:broken',
      '2026-10-03:broken',
      '2026-10-04:broken',
    ])
    const dayEntries = (await b.ledger.toArray()).filter((e) => e.kind.startsWith('day_'))
    expect(dayEntries).toHaveLength(4)
  })

  it('imports a backup with no photos: finished tasks stay finished', async () => {
    const { a } = await deviceA()
    const b = await fresh()
    await importBackup(b, await throughFile(await exportBackup(a, { includePhotos: false })), 'replace', '2026-10-02')
    const done = await b.occurrences.where('status').equals('done').toArray()
    expect(done).toHaveLength(1)
    expect(done[0].proofId).toBeUndefined()
    expect(await b.proofs.count()).toBe(0)
  })

  it('is all or nothing: a failure part-way leaves the device exactly as it was', async () => {
    const { a } = await deviceA()
    const b = await fresh()
    await createTask(b, { title: 'Mine', recurrence: { type: 'daily' } }, '2026-10-01', NOW)
    await runCatchUp(b, '2026-10-03', NOW)
    const before = await snapshot(b)

    const contents = await exportBackup(a)
    // Two day records for one date: the last table written fails after the others were already replaced.
    const broken: BackupContents = { ...contents, days: [...contents.days, ...contents.days] }
    await expect(importBackup(b, broken, 'replace', '2026-10-03', NOW)).rejects.toThrow()
    expect(await snapshot(b)).toEqual(before)
  })
})

describe('merge', () => {
  /** B starts as a copy of A at Oct 2; then they diverge on Oct 2. */
  async function diverged() {
    const { a, task } = await deviceA()
    const b = await fresh()
    await importBackup(b, await throughFile(await exportBackup(a, { now: NOW })), 'replace', '2026-10-02', NOW)
    return { a, b, task }
  }

  it('keeps a task finished on the other device, with its photo and XP, and re-scores the day', async () => {
    const { a, b, task } = await diverged()
    const id = `${task.id}_2026-10-02`
    await completeOccurrence(a, id, photo('PHOTO-A2'), '2026-10-02', NOW)
    const fromA = await throughFile(await exportBackup(a, { now: NOW }), 'pw-12345')

    // B did nothing on Oct 2 and was opened on Oct 3: missed day, -100
    await runCatchUp(b, '2026-10-03', NOW)
    expect((await b.days.get('2026-10-02'))?.outcome).toBe('broken')

    const summary = await importBackup(b, fromA, 'merge', '2026-10-03', NOW)
    expect(summary).toMatchObject({ mode: 'merge', photosAdded: 1, occurrencesChanged: 1 })

    const occ = await b.occurrences.get(id)
    expect(occ?.status).toBe('done')
    expect(await (await b.proofs.get(occ!.proofId!))!.blob.text()).toBe('PHOTO-A2')
    expect(await b.proofs.count()).toBe(2)

    expect((await b.days.orderBy('date').toArray()).map((d) => `${d.date}:${d.outcome}`)).toEqual([
      '2026-10-01:perfect',
      '2026-10-02:perfect',
    ])
    const entries = (await b.ledger.toArray()).map((e) => `${e.id}:${e.delta}`).sort()
    expect(entries).toEqual([
      `day_2026-10-01:100`,
      `day_2026-10-02:115`,
      `task_complete_${task.id}_2026-10-01:100`,
      `task_complete_${task.id}_2026-10-02:100`,
    ].sort())
  })

  it('does not undo a finished task when the other device still has it pending', async () => {
    const { a, b, task } = await diverged()
    await completeOccurrence(b, `${task.id}_2026-10-02`, photo('PHOTO-B2'), '2026-10-02', NOW)
    await importBackup(b, await exportBackup(a), 'merge', '2026-10-02', NOW) // A's Oct 2 is still pending
    const occ = await b.occurrences.get(`${task.id}_2026-10-02`)
    expect(occ?.status).toBe('done')
    expect(await (await b.proofs.get(occ!.proofId!))!.blob.text()).toBe('PHOTO-B2')
  })

  it('takes "expired" over "pending", since it is the later state of the same day', async () => {
    const { a, b, task } = await diverged()
    await runCatchUp(a, '2026-10-03', NOW) // A: Oct 2 expired
    await importBackup(b, await exportBackup(a), 'merge', '2026-10-02', NOW) // B: Oct 2 pending
    expect((await b.occurrences.get(`${task.id}_2026-10-02`))?.status).toBe('expired')
  })

  it('when both finished the same task, keeps the copy that has a photo', async () => {
    const { a, b, task } = await diverged()
    const id = `${task.id}_2026-10-02`
    await completeOccurrence(a, id, photo('PHOTO-A2'), '2026-10-02', NOW)
    await completeOccurrence(b, id, photo('PHOTO-B2'), '2026-10-02', NOW)

    // incoming has no photo: local keeps its own
    await importBackup(b, await throughFile(await exportBackup(a, { includePhotos: false })), 'merge', '2026-10-02', NOW)
    expect(await (await b.proofs.get((await b.occurrences.get(id))!.proofId!))!.blob.text()).toBe('PHOTO-B2')

    // local has no photo: it takes the incoming one
    const c = await fresh()
    await importBackup(c, await throughFile(await exportBackup(b, { includePhotos: false })), 'replace', '2026-10-02', NOW)
    expect((await c.occurrences.get(id))?.proofId).toBeUndefined()
    await importBackup(c, await throughFile(await exportBackup(a, { now: NOW })), 'merge', '2026-10-02', NOW)
    expect(await (await c.proofs.get((await c.occurrences.get(id))!.proofId!))!.blob.text()).toBe('PHOTO-A2')
  })

  it('only brings photos that are actually needed', async () => {
    const { a, b } = await diverged()
    const summary = await importBackup(b, await exportBackup(a), 'merge', '2026-10-02', NOW)
    expect(summary).toMatchObject({ photosAdded: 0, occurrencesChanged: 0, tasksAdded: 0, tasksUpdated: 0 })
    expect(await b.proofs.count()).toBe(1)
  })

  it('adds new tasks and keeps tasks that only exist here', async () => {
    const { a, b } = await diverged()
    await createTask(a, { title: 'Only on A', recurrence: { type: 'daily' } }, '2026-10-02', NOW)
    await createTask(b, { title: 'Only on B', recurrence: { type: 'daily' } }, '2026-10-02', NOW)
    const summary = await importBackup(b, await exportBackup(a), 'merge', '2026-10-02', NOW)
    expect(summary.tasksAdded).toBe(1)
    expect((await b.tasks.toArray()).map((t) => t.title).sort()).toEqual(['Only on A', 'Only on B', 'Read'])
  })

  it('keeps the most recently edited copy of a task, including deletes', async () => {
    const { a, b, task } = await diverged()
    await updateTask(a, task.id, { title: 'Read (A)' }, '2026-10-02', NOW + 10)
    await updateTask(b, task.id, { title: 'Read (B)' }, '2026-10-02', NOW + 20)
    await importBackup(b, await exportBackup(a), 'merge', '2026-10-02', NOW)
    expect((await b.tasks.get(task.id))?.title).toBe('Read (B)') // B edited later

    await archiveTask(a, task.id, '2026-10-02', NOW + 30) // A deleted it, later still
    const summary = await importBackup(b, await exportBackup(a), 'merge', '2026-10-02', NOW)
    expect(summary.tasksUpdated).toBe(1)
    expect((await b.tasks.get(task.id))?.archivedOn).toBe('2026-10-02')
  })

  it('fills in task occurrences the file never had, then scores them', async () => {
    const { a, b } = await diverged()
    // A's backup is from Oct 2, B is already on Oct 5; the merge must not leave holes for A's tasks
    await runCatchUp(b, '2026-10-05', NOW)
    await createTask(a, { title: 'Late task', recurrence: { type: 'daily' } }, '2026-10-02', NOW)
    await importBackup(b, await exportBackup(a), 'merge', '2026-10-05', NOW)
    const late = (await b.tasks.toArray()).find((t) => t.title === 'Late task')!
    const dates = (await b.occurrences.where('taskId').equals(late.id).toArray()).map((o) => o.date).sort()
    expect(dates).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'])
  })

  it('is idempotent: merging the same file again changes nothing', async () => {
    const { a, b, task } = await diverged()
    await completeOccurrence(a, `${task.id}_2026-10-02`, photo('PHOTO-A2'), '2026-10-02', NOW)
    await runCatchUp(b, '2026-10-03', NOW)
    const file = await throughFile(await exportBackup(a, { now: NOW }))
    await importBackup(b, file, 'merge', '2026-10-03', NOW)
    const once = await snapshot(b)
    const summary = await importBackup(b, file, 'merge', '2026-10-03', NOW)
    expect(await snapshot(b)).toEqual(once)
    expect(summary).toMatchObject({ photosAdded: 0, occurrencesChanged: 0, tasksAdded: 0 })
  })

  it('merging a device with itself changes nothing', async () => {
    const { a } = await deviceA()
    const before = await snapshot(a)
    await importBackup(a, await exportBackup(a, { now: NOW }), 'merge', '2026-10-02', NOW)
    expect(await snapshot(a)).toEqual(before)
  })

  it('merging into an empty device gives the same result as replacing', async () => {
    const { a } = await deviceA()
    const viaMerge = await fresh()
    const viaReplace = await fresh()
    const contents = await throughFile(await exportBackup(a, { now: NOW }))
    await importBackup(viaMerge, contents, 'merge', '2026-10-02', NOW)
    await importBackup(viaReplace, contents, 'replace', '2026-10-02', NOW)
    expect(await snapshot(viaMerge)).toEqual(await snapshot(viaReplace))
  })

  it('is all or nothing: a failure after tasks and occurrences were merged undoes them', async () => {
    const { a, b } = await diverged()
    const before = await snapshot(b)
    const contents = await exportBackup(a)
    // A new task and occurrence are written first; the duplicated ledger id then makes the ledger write fail.
    const dup = { id: 'task_complete_dup', date: '2026-10-02', kind: 'task_complete' as const, delta: 100, createdAt: 1 }
    const broken: BackupContents = {
      ...contents,
      tasks: [{ ...contents.tasks[0], id: 'new-task' }],
      occurrences: [{ id: 'new-task_2026-10-02', taskId: 'new-task', date: '2026-10-02', title: 'New', status: 'pending' }],
      ledger: [dup, dup],
    }
    await expect(importBackup(b, broken, 'merge', '2026-10-02', NOW)).rejects.toThrow()
    expect(await b.tasks.get('new-task')).toBeUndefined()
    expect(await snapshot(b)).toEqual(before)
  })
})
