import { describe, expect, it } from 'vitest'
import { isValidTime, shouldNudge } from './nudge'

const at = (h: number, m = 0) => new Date(2026, 9, 13, h, m)
const base = { time: '20:00', pending: 2, lastNudgeDate: undefined, today: '2026-10-13' } as const

describe('shouldNudge', () => {
  it('waits until the chosen time, then fires', () => {
    expect(shouldNudge({ ...base, now: at(19, 59) })).toBe(false)
    expect(shouldNudge({ ...base, now: at(20, 0) })).toBe(true)
    expect(shouldNudge({ ...base, now: at(23, 30) })).toBe(true)
  })

  it('still fires when the app is opened after the time', () => {
    expect(shouldNudge({ ...base, now: at(21, 15) })).toBe(true)
  })

  it('stays quiet when off, when nothing is left, or when today already had one', () => {
    expect(shouldNudge({ ...base, time: undefined, now: at(21) })).toBe(false)
    expect(shouldNudge({ ...base, pending: 0, now: at(21) })).toBe(false)
    expect(shouldNudge({ ...base, lastNudgeDate: '2026-10-13', now: at(21) })).toBe(false)
    expect(shouldNudge({ ...base, lastNudgeDate: '2026-10-12', now: at(21) })).toBe(true)
  })

  it('ignores a damaged time', () => {
    expect(shouldNudge({ ...base, time: '25:99', now: at(21) })).toBe(false)
  })
})

describe('isValidTime', () => {
  it('accepts HH:MM only', () => {
    expect(['00:00', '08:05', '23:59'].every(isValidTime)).toBe(true)
    expect(['', '8:05', '24:00', '12:60', '12:5', 5, undefined].some(isValidTime)).toBe(false)
  })
})
