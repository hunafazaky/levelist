import { addDays, weekdayOf, type DateStr } from './dates'
import type { DayOutcome } from './days'

export interface CalendarCell {
  date: DateStr
  outcome?: DayOutcome
  isToday: boolean
  isFuture: boolean
}

/** The last `weeks` weeks (Monday to Sunday), oldest first, ending with the week that contains `today`. */
export function buildCalendar(
  today: DateStr,
  weeks: number,
  outcomes: ReadonlyMap<DateStr, DayOutcome>,
): CalendarCell[][] {
  const mondayThisWeek = addDays(today, -((weekdayOf(today) + 6) % 7))
  const start = addDays(mondayThisWeek, -7 * (weeks - 1))
  const grid: CalendarCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const row: CalendarCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      row.push({ date, outcome: outcomes.get(date), isToday: date === today, isFuture: date > today })
    }
    grid.push(row)
  }
  return grid
}
