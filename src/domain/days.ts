/**
 * How a finished day is classified.
 *  - paused:  no task exists at all, so the day neither extends nor breaks anything
 *  - rest:    tasks exist but none was scheduled; streaks carry on, no XP
 *  - perfect: at least one task was scheduled and every one was done
 *  - streak:  at least one done, but not all
 *  - broken:  tasks were scheduled and none was done
 */
export type DayOutcome = 'paused' | 'rest' | 'perfect' | 'streak' | 'broken'

export interface DayCounts {
  /** Occurrences that existed on the day. */
  scheduled: number
  done: number
  /** Whether any task was active that day, scheduled or not. */
  hasActiveTask: boolean
}

export function classifyDay({ scheduled, done, hasActiveTask }: DayCounts): DayOutcome {
  if (scheduled === 0) return hasActiveTask ? 'rest' : 'paused'
  if (done >= scheduled) return 'perfect'
  if (done > 0) return 'streak'
  return 'broken'
}
