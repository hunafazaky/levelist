import { describe, expect, it } from 'vitest'
import { buildCalendar } from './calendar'

describe('buildCalendar', () => {
  it('builds Monday-to-Sunday weeks ending with the week of today', () => {
    // 2026-10-07 is a Wednesday
    const grid = buildCalendar('2026-10-07', 2, new Map([['2026-10-05', 'perfect']]))
    expect(grid).toHaveLength(2)
    expect(grid[0][0].date).toBe('2026-09-28') // Monday of the previous week
    expect(grid[1][0].date).toBe('2026-10-05') // Monday of this week
    expect(grid[1][6].date).toBe('2026-10-11')
    expect(grid[1][0].outcome).toBe('perfect')
    expect(grid[1][2]).toMatchObject({ date: '2026-10-07', isToday: true, isFuture: false })
    expect(grid[1][3].isFuture).toBe(true)
  })

  it('puts a Sunday at the end of its own week', () => {
    const grid = buildCalendar('2026-10-04', 1, new Map()) // Sunday
    expect(grid[0][0].date).toBe('2026-09-28')
    expect(grid[0][6]).toMatchObject({ date: '2026-10-04', isToday: true })
  })
})
