import { addDays, diffDays, weekdayOf, type DateStr } from '../domain/dates'
import { t } from '../i18n'
import { monthName, weekdayName } from './text'

/** "Sun 5 Oct" */
export function formatDate(d: DateStr): string {
  const [, m, day] = d.split('-').map(Number)
  return `${weekdayName(weekdayOf(d))} ${day} ${monthName(m - 1)}`
}

/** "Today", "Tomorrow", or "Sun 5 Oct" */
export function formatRelative(d: DateStr, today: DateStr): string {
  const diff = diffDays(today, d)
  if (diff === 0) return t('Today')
  if (diff === 1) return t('Tomorrow')
  return formatDate(d)
}

export { addDays }

/** "Tue 6 Oct, 08:24" */
export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  const date = `${weekdayName(d.getDay())} ${d.getDate()} ${monthName(d.getMonth())}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${date}, ${time}`
}

/** "1.4 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "1 photo", "3 photos". The words are translated; Indonesian has no plural, so both forms map to one word. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${t(n === 1 ? one : many)}`
