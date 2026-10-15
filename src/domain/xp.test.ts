import { describe, expect, it } from 'vitest'
import { sortLedger, totalXp, xpTimeline } from './xp'

describe('totalXp', () => {
  it('sums deltas', () => {
    expect(totalXp([100, 100, 50])).toBe(250)
    expect(totalXp([])).toBe(0)
  })

  it('floors the running total at zero, so penalties never create debt', () => {
    expect(totalXp([50, -100, 100])).toBe(100)
    expect(totalXp([-100, -100])).toBe(0)
  })
})

describe('sortLedger and xpTimeline', () => {
  const e = (id: string, date: string, kind: string, delta: number) => ({ id, date, kind, delta })

  it('orders by day, then task completions before the day entry, regardless of creation time', () => {
    const sorted = sortLedger([
      e('day_2026-10-02', '2026-10-02', 'day_broken', -100),
      e('day_2026-10-01', '2026-10-01', 'day_perfect', 100),
      e('task_complete_b', '2026-10-02', 'task_complete', 100),
      e('task_complete_a', '2026-10-01', 'task_complete', 100),
    ])
    expect(sorted.map((x) => x.id)).toEqual([
      'task_complete_a',
      'day_2026-10-01',
      'task_complete_b',
      'day_2026-10-02',
    ])
  })

  it('builds a running total that never goes below zero', () => {
    const timeline = xpTimeline([
      e('a', '2026-10-01', 'task_complete', 100),
      e('b', '2026-10-02', 'day_broken', -100),
      e('c', '2026-10-03', 'day_broken', -100),
      e('d', '2026-10-04', 'task_complete', 100),
    ])
    expect(timeline.map((p) => p.total)).toEqual([100, 0, 0, 100])
  })
})
