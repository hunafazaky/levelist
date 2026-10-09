import { describe, expect, it } from 'vitest'
import { totalXp } from './xp'

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
