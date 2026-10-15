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
    expect(result).toMatchObject({ created: 4, expired: 4 }) // Oct 1 plus Oct 2–4 expire; Oct 2–5 are created
    const rows = await dates()
    expect(rows.filter((r) => r.endsWith('expired'))).toHaveLength(4)
    expect(rows.at(-1)).toBe('2026-10-05:Read:pending')
  })

  it('is idempotent and never reverts done occurrences', async () => {
    await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await db.occurrences.update('' + (await db.occurrences.toCollection().first())!.id, { status: 'done' })
    await runCatchUp(db, '2026-10-03')
    const first = await dates()
    expect(await runCatchUp(db, '2026-10-03')).toMatchObject({ created: 0, expired: 0, finalized: 0 })
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
    expect(await db.ledger.where('kind').equals('task_complete').count()).toBe(1)
  })
})


describe('day finalization', () => {
  const photo = () => ({ blob: new Blob(['x'], { type: 'image/jpeg' }), mime: 'image/jpeg' })
  const dayRows = async () => (await db.days.orderBy('date').toArray()).map((d) => `${d.date}:${d.outcome}`)
  const dayXp = async () =>
    (await db.ledger.where('kind').anyOf('day_perfect', 'day_streak', 'day_broken', 'day_rest').sortBy('date')).map(
      (e) => `${e.date}:${e.delta}`,
    )

  it('scores a fully completed day as perfect once the day is over, and never scores today', async () => {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await completeOccurrence(db, `${t.id}_2026-10-01`, photo(), '2026-10-01')

    expect(await runCatchUp(db, '2026-10-01')).toMatchObject({ finalized: 0 })
    expect(await dayRows()).toEqual([])

    expect(await runCatchUp(db, '2026-10-02')).toMatchObject({ finalized: 1 })
    expect(await dayRows()).toEqual(['2026-10-01:perfect'])
    expect(await dayXp()).toEqual(['2026-10-01:100'])
  })

  it('scores a day with some tasks done as a streak day (+50)', async () => {
    const a = await createTask(db, { title: 'A', recurrence: { type: 'daily' } }, '2026-10-01')
    await createTask(db, { title: 'B', recurrence: { type: 'daily' } }, '2026-10-01')
    await completeOccurrence(db, `${a.id}_2026-10-01`, photo(), '2026-10-01')
    await runCatchUp(db, '2026-10-02')
    expect(await dayRows()).toEqual(['2026-10-01:streak'])
    expect(await dayXp()).toEqual(['2026-10-01:50'])
  })

  it('applies -100 to every missed day after the app was closed for days, and a perfect day first', async () => {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await completeOccurrence(db, `${t.id}_2026-10-01`, photo(), '2026-10-01')
    const result = await runCatchUp(db, '2026-10-04')
    expect(result).toMatchObject({ finalized: 3 })
    expect(await dayRows()).toEqual(['2026-10-01:perfect', '2026-10-02:broken', '2026-10-03:broken'])
    expect(await dayXp()).toEqual(['2026-10-01:100', '2026-10-02:-100', '2026-10-03:-100'])
  })

  it('grows the perfect bonus across consecutive perfect days', async () => {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03']) {
      await runCatchUp(db, day)
      await completeOccurrence(db, `${t.id}_${day}`, photo(), day)
    }
    await runCatchUp(db, '2026-10-04')
    expect(await dayXp()).toEqual(['2026-10-01:100', '2026-10-02:115', '2026-10-03:130'])
  })

  it('records rest days without awarding XP and keeps the perfect bonus run going', async () => {
    // Sunday-only task; 2026-10-04 is a Sunday
    const t = await createTask(db, { title: 'Jogging', recurrence: { type: 'weekdays', days: [0] } }, '2026-10-04')
    await completeOccurrence(db, `${t.id}_2026-10-04`, photo(), '2026-10-04')
    await runCatchUp(db, '2026-10-06')
    expect(await dayRows()).toEqual(['2026-10-04:perfect', '2026-10-05:rest'])
    expect(await dayXp()).toEqual(['2026-10-04:100'])
  })

  it('skips paused days: no task exists at all', async () => {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await archiveTask(db, t.id, '2026-10-02')
    await runCatchUp(db, '2026-10-06')
    // Oct 1 was a real day (task existed, never done) -> broken; Oct 2-5 had no tasks -> paused, not stored
    expect(await dayRows()).toEqual(['2026-10-01:broken'])
    expect(await dayXp()).toEqual(['2026-10-01:-100'])
  })

  it('still counts a day when its only task was completed and then deleted the same day', async () => {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await completeOccurrence(db, `${t.id}_2026-10-01`, photo(), '2026-10-01')
    await archiveTask(db, t.id, '2026-10-01')
    await runCatchUp(db, '2026-10-02')
    expect(await dayRows()).toEqual(['2026-10-01:perfect'])
  })

  it('is idempotent and does not duplicate or rewrite anything on repeat or later runs', async () => {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await completeOccurrence(db, `${t.id}_2026-10-01`, photo(), '2026-10-01')
    await runCatchUp(db, '2026-10-03')
    const ledgerBefore = await db.ledger.toArray()
    await runCatchUp(db, '2026-10-03')
    await runCatchUp(db, '2026-10-03')
    expect(await db.ledger.toArray()).toEqual(ledgerBefore)
    expect(await db.days.count()).toBe(2)

    await runCatchUp(db, '2026-10-04')
    expect(await db.days.count()).toBe(3)
    expect(await db.ledger.count()).toBe(ledgerBefore.length + 1)
  })

  it('recovers from lost bookkeeping without awarding XP twice', async () => {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await completeOccurrence(db, `${t.id}_2026-10-01`, photo(), '2026-10-01')
    await runCatchUp(db, '2026-10-03')
    const ledgerBefore = (await db.ledger.toArray()).map((e) => e.id).sort()

    await db.meta.delete('lastFinalizedDate')
    await db.days.clear()
    await runCatchUp(db, '2026-10-04')

    expect((await db.ledger.toArray()).map((e) => e.id).sort()).toEqual([...ledgerBefore, 'day_2026-10-03'].sort())
    expect(await db.days.count()).toBe(3)
  })

  it('scores history from before this feature existed (tasks and occurrences but no day records)', async () => {
    const t = await createTask(db, { title: 'Read', recurrence: { type: 'daily' } }, '2026-10-01')
    await completeOccurrence(db, `${t.id}_2026-10-01`, photo(), '2026-10-01')
    await runCatchUp(db, '2026-10-02')
    await db.meta.delete('lastFinalizedDate')
    await db.days.clear()
    await db.ledger.where('kind').equals('day_perfect').delete()

    await runCatchUp(db, '2026-10-02')
    expect(await dayRows()).toEqual(['2026-10-01:perfect'])
    expect(await dayXp()).toEqual(['2026-10-01:100'])
  })
})
