import { WEEKDAY_SHORT, addDays, diffDays, type DateStr } from '../domain/dates'
import { weekdayOf } from '../domain/dates'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Sun 5 Oct" */
export function formatDate(d: DateStr): string {
  const [, m, day] = d.split('-').map(Number)
  return `${WEEKDAY_SHORT[weekdayOf(d)]} ${day} ${MONTHS[m - 1]}`
}

/** "Today", "Tomorrow", or "Sun 5 Oct" */
export function formatRelative(d: DateStr, today: DateStr): string {
  const diff = diffDays(today, d)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return formatDate(d)
}

export { addDays }
