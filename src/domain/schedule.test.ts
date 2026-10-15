import { describe, expect, it } from 'vitest'
import { missingOccurrences, occurrencesToExpire, staleOccurrences, type TaskLike } from './schedule'

const jogging: TaskLike = {
  id: 'jog',
  title: 'Jogging',
  recurrence: { type: 'weekdays', days: [0] },
  createdOn: '2026-10-01',
}
const read: TaskLike = { id: 'read', title: 'Read', recurrence: { type: 'daily' }, createdOn: '2026-10-03' }

describe('missingOccurrences', () => {
  it('creates one occurrence per applicable task per day', () => {
    const out = missingOccurrences([jogging, read], [], '2026-10-03', '2026-10-05')
    expect(out).toEqual([
      { taskId: 'read', date: '2026-10-03', title: 'Read' },
      { taskId: 'jog', date: '2026-10-04', title: 'Jogging' }, // Sunday
      { taskId: 'read', date: '2026-10-04', title: 'Read' },
      { taskId: 'read', date: '2026-10-05', title: 'Read' },
    ])
  })

  it('is idempotent: existing occurrences are skipped', () => {
    const existing = [{ taskId: 'read', date: '2026-10-03' }]
    const out = missingOccurrences([read], existing, '2026-10-03', '2026-10-04')
    expect(out.map((o) => o.date)).toEqual(['2026-10-04'])
  })

  it('does not create occurrences before a task was created or after it was archived', () => {
    const archived = { ...read, createdOn: '2026-10-03', archivedOn: '2026-10-05' }
    const out = missingOccurrences([archived], [], '2026-10-01', '2026-10-10')
    expect(out.map((o) => o.date)).toEqual(['2026-10-03', '2026-10-04'])
  })

  it('fills the whole gap after the app was closed for days', () => {
    const out = missingOccurrences([read], [], '2026-10-03', '2026-10-09')
    expect(out).toHaveLength(7)
  })
})

describe('occurrencesToExpire', () => {
  const occ = [
    { taskId: 'a', date: '2026-10-03', status: 'pending' as const },
    { taskId: 'b', date: '2026-10-04', status: 'pending' as const },
    { taskId: 'c', date: '2026-10-03', status: 'done' as const },
    { taskId: 'd', date: '2026-10-02', status: 'expired' as const },
  ]

  it('expires only pending occurrences from days before today', () => {
    expect(occurrencesToExpire(occ, '2026-10-04').map((o) => o.taskId)).toEqual(['a'])
  })

  it('keeps today open until midnight', () => {
    expect(occurrencesToExpire(occ, '2026-10-03')).toEqual([])
  })
})

describe('staleOccurrences', () => {
  it('flags pending occurrences of today that no longer match, never done ones', () => {
    const edited = { ...jogging, recurrence: { type: 'weekdays', days: [1] } as const }
    const occ = [
      { taskId: 'jog', date: '2026-10-04', status: 'pending' as const },
      { taskId: 'read', date: '2026-10-04', status: 'done' as const },
      { taskId: 'gone', date: '2026-10-04', status: 'pending' as const },
    ]
    const stale = staleOccurrences([edited, { ...read, archivedOn: '2026-10-04' }], occ, '2026-10-04')
    expect(stale.map((o) => o.taskId).sort()).toEqual(['gone', 'jog'])
  })
})
