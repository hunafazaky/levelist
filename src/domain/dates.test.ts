import { describe, expect, it } from 'vitest'
import { addDays, dateRange, diffDays, isDateStr, toDateStr, weekdayOf } from './dates'

describe('dates', () => {
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('computes day differences and weekdays', () => {
    expect(diffDays('2026-10-02', '2026-10-09')).toBe(7)
    expect(diffDays('2026-10-09', '2026-10-02')).toBe(-7)
    expect(weekdayOf('2026-10-04')).toBe(0) // Sunday
    expect(weekdayOf('2026-10-06')).toBe(2) // Tuesday
  })

  it('builds inclusive ranges', () => {
    expect(dateRange('2026-10-01', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(dateRange('2026-10-03', '2026-10-01')).toEqual([])
  })

  it('validates dates', () => {
    expect(isDateStr('2026-02-30')).toBe(false)
    expect(isDateStr('2026-2-3')).toBe(false)
    expect(isDateStr('2026-02-28')).toBe(true)
  })

  it('formats local dates and honours dayStartHour', () => {
    const t = new Date(2026, 9, 5, 2, 30) // 2026-10-05 02:30 local
    expect(toDateStr(t)).toBe('2026-10-05')
    expect(toDateStr(t, 4)).toBe('2026-10-04')
  })
})
