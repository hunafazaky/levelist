import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { archiveTask, completeOccurrence, createTask, runCatchUp, updateTask } from './repo'
import { QuestDB } from './schema'

let db: QuestDB
let n = 0

beforeEach(async () => {
  db = new QuestDB(`test-${n++}`)
  await db.open()
})

const dates = async () => (await db.occurrences.orderBy('date').toArray()).map((o) => `${o.date}:${o.title}:${o.status}`)

describe('createTask', () => {
  it('creates today\'s occurrence immediately when the recurrence matches today', async () => {
    await createTask(db, { title: ' Jogging ', recurrence: { type: 'weekdays', days: [0] } }, '2026-10-04') // Sunday
    expect(await dates()).toEqual(['2026-10-04:Jogging:pending'])
  })

  it('creates nothing today when the recurrence does not match', async () => {
    await createTask(db, { title: 'Jogging', recurrence: { type: 'weekdays', days: [0] } }, '2026-10-05') // Monday
    expect(await dates()).toEqual([])
  })

  it('rejects empty titles and invalid recurrences', async () => {
    await expect(createTask(db, { title: '  ', recurrence: { type: 'daily' } }, '2026-10-04')).rejects.toThrow()
    await expect(
      createTask(db, { title: 'x', recurrence: { type: 'weekdays', days: [] } }, '2026-10-04'),
    ).rejects.toThrow()
  })
})

describe('runCatchUp', () => {
  it('expires an untouched occurrence once its day is over and refreshes on the next scheduled day', async () => {
    await createTask(db, { title: 'Jogging', recurrence: { type: 'weekdays', days: [0] } }, '2026-10-04')
    await runCatchUp(db, '2026-10-04')

    // Monday: Sunday's occurrence expired, nothing new yet
    await runCatchUp(db, '2026-10-05')
    expect(await dates()).toEqual(['2026-10-04:Jogging:expired'])

    // Next Sunday: a fresh pending occurrence appears
    const result = await runCatchUp(db, '2026-10-11')
    expect(result.created).toBe(1)
    expect(await dates()).toEqual(['2026-10-04:Jogging:expired', '2026-10-11:Jogging:pending'])
  })

  it('backfills and expires every missed day after a long gap', async () => {
    await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await runCatchUp(db, '2026-10-01')
    const result = await runCatchUp(db, '2026-10-05')
    expect(result).toEqual({ created: 4, expired: 4 }) // Oct 1 plus Oct 2–4 expire; Oct 2–5 are created
    const rows = await dates()
    expect(rows.filter((r) => r.endsWith('expired'))).toHaveLength(4)
    expect(rows.at(-1)).toBe('2026-10-05:Read:pending')
  })

  it('is idempotent and never reverts done occurrences', async () => {
    await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await db.occurrences.update('' + (await db.occurrences.toCollection().first())!.id, { status: 'done' })
    await runCatchUp(db, '2026-10-03')
    const first = await dates()
    expect(await runCatchUp(db, '2026-10-03')).toEqual({ created: 0, expired: 0 })
    expect(await dates()).toEqual(first)
    expect(first[0]).toBe('2026-10-01:Read:done')
  })
})

describe('updateTask', () => {
  it('re-syncs today: adds an occurrence when the new recurrence includes today', async () => {
    const t = await createTask(db, { title: 'Gym', recurrence: { type: 'weekdays', days: [0] } }, '2026-10-05') // Monday
    await updateTask(db, t.id, { recurrence: { type: 'weekdays', days: [1] } }, '2026-10-05')
    expect(await dates()).toEqual(['2026-10-05:Gym:pending'])
  })

  it('removes today\'s pending occurrence when the new recurrence excludes today, but keeps done ones', async () => {
    const t = await createTask(db, { title: 'Gym', recurrence: { type: 'daily' } }, '2026-10-05')
    await updateTask(db, t.id, { recurrence: { type: 'weekdays', days: [3] } }, '2026-10-05')
    expect(await dates()).toEqual([])

    const t2 = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-05')
    await db.occurrences.update(`${t2.id}_2026-10-05`, { status: 'done' })
    await updateTask(db, t2.id, { recurrence: { type: 'weekdays', days: [3] } }, '2026-10-05')
    expect(await dates()).toEqual(['2026-10-05:Read:done'])
  })

  it('renames pending occurrences only', async () => {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-05')
    await runCatchUp(db, '2026-10-05')
    await runCatchUp(db, '2026-10-06') // Oct 5 expires, Oct 6 pending
    await updateTask(db, t.id, { title: 'Read book' }, '2026-10-06')
    expect(await dates()).toEqual(['2026-10-05:Read:expired', '2026-10-06:Read book:pending'])
  })
})

describe('archiveTask', () => {
  it('removes today\'s pending occurrence, keeps history, and stops future occurrences', async () => {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await runCatchUp(db, '2026-10-03')
    await archiveTask(db, t.id, '2026-10-03')
    expect(await dates()).toEqual(['2026-10-01:Read:expired', '2026-10-02:Read:expired'])

    await runCatchUp(db, '2026-10-06')
    expect((await dates()).length).toBe(2)
    expect((await db.tasks.get(t.id))?.archivedOn).toBe('2026-10-03')
  })
})

describe('completeOccurrence', () => {
  const photo = () => ({ blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), mime: 'image/jpeg' })

  async function setup() {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-04')
    return `${t.id}_2026-10-04`
  }

  it('stores the proof, marks the task done and awards 100 XP', async () => {
    const id = await setup()
    const entry = await completeOccurrence(db, id, photo(), '2026-10-04', 1000)
    expect(entry).toMatchObject({ kind: 'task_complete', delta: 100, refId: id, date: '2026-10-04' })

    const occ = await db.occurrences.get(id)
    expect(occ?.status).toBe('done')
    expect(occ?.completedAt).toBe(1000)
    const proof = await db.proofs.get(occ!.proofId!)
    expect(proof?.mime).toBe('image/jpeg')
    expect(proof?.blob.size).toBeGreaterThan(0)
    expect(await db.ledger.count()).toBe(1)
  })

  it('cannot be completed without a proof image', async () => {
    const id = await setup()
    await expect(completeOccurrence(db, id, { blob: new Blob([]), mime: 'image/jpeg' }, '2026-10-04')).rejects.toThrow(
      /photo/,
    )
    expect((await db.occurrences.get(id))?.status).toBe('pending')
    expect(await db.ledger.count()).toBe(0)
  })

  it('cannot be completed twice (no double XP)', async () => {
    const id = await setup()
    await completeOccurrence(db, id, photo(), '2026-10-04')
    await expect(completeOccurrence(db, id, photo(), '2026-10-04')).rejects.toThrow(/already done/)
    expect(await db.ledger.count()).toBe(1)
    expect(await db.proofs.count()).toBe(1)
  })

  it('cannot complete a task from a past day, even before catch-up has expired it', async () => {
    const id = await setup()
    await expect(completeOccurrence(db, id, photo(), '2026-10-05')).rejects.toThrow(/over/)
    expect(await db.ledger.count()).toBe(0)
  })

  it('stays done and keeps its XP through catch-up', async () => {
    const id = await setup()
    await completeOccurrence(db, id, photo(), '2026-10-04')
    await runCatchUp(db, '2026-10-06')
    expect((await db.occurrences.get(id))?.status).toBe('done')
    expect(await db.ledger.count()).toBe(1)
  })
})
