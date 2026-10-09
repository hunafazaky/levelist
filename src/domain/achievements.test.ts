import { describe, expect, it } from 'vitest'
import { computeAchievements } from './achievements'
import { addDays } from './dates'
import type { DayOutcome } from './days'
import { replayDays } from './streaks'
import { xpForLevel } from './levels'

function run(...outcomes: DayOutcome[]) {
  return replayDays(outcomes.map((outcome, i) => ({ date: addDays('2026-10-01', i), outcome })))
}
const by = (list: ReturnType<typeof computeAchievements>) => Object.fromEntries(list.map((a) => [a.id, a.unlockedOn]))
const repeat = (o: DayOutcome, n: number) => Array<DayOutcome>(n).fill(o)

describe('computeAchievements', () => {
  it('starts with everything locked', () => {
    const list = computeAchievements([], [])
    expect(list.every((a) => a.unlockedOn === undefined)).toBe(true)
    expect(list.length).toBeGreaterThan(15)
  })

  it('unlocks first streak on a day with any task done, and first perfect on an all-done day', () => {
    const a = by(computeAchievements(run('broken', 'streak', 'perfect'), []))
    expect(a.first_streak).toBe('2026-10-02')
    expect(a.first_perfect).toBe('2026-10-03')
  })

  it('rest days alone do not unlock first streak or first perfect', () => {
    const a = by(computeAchievements(run('rest', 'rest'), []))
    expect(a.first_streak).toBeUndefined()
    expect(a.first_perfect).toBeUndefined()
  })

  it('unlocks week streaks at n x 7 straight days, counting perfect days too', () => {
    const outcomes = [...repeat('perfect', 3), ...repeat('streak', 4)]
    const a = by(computeAchievements(run(...outcomes), []))
    expect(a.streak_weeks_1).toBe('2026-10-07')
    expect(a.perfect_weeks_1).toBeUndefined() // the plain streak days interrupted the perfect run
    expect(a.streak_weeks_2).toBeUndefined()
  })

  it('unlocks perfect weeks only for perfect (or rest) days in a row', () => {
    const a = by(computeAchievements(run(...repeat('perfect', 14)), []))
    expect(a.perfect_weeks_1).toBe('2026-10-07')
    expect(a.perfect_weeks_2).toBe('2026-10-14')
    expect(a.perfect_weeks_4).toBeUndefined()
  })

  it('unlocks first break only when a running streak is lost', () => {
    expect(by(computeAchievements(run('broken', 'broken'), [])).first_break).toBeUndefined()
    expect(by(computeAchievements(run('perfect', 'broken'), [])).first_break).toBe('2026-10-02')
  })

  it('unlocks level milestones the first time XP crosses the line and keeps them after XP drops', () => {
    const level10 = xpForLevel(10)
    const timeline = [
      { date: '2026-10-01', total: level10 - 1 },
      { date: '2026-10-02', total: level10 },
      { date: '2026-10-03', total: 0 },
    ]
    const a = by(computeAchievements([], timeline))
    expect(a.level_10).toBe('2026-10-02')
    expect(a.level_20).toBeUndefined()
  })
})
