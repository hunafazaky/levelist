import type { DateStr } from './dates'

/** "HH:MM", 24-hour, as an <input type="time"> gives it. */
export const isValidTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

export const DEFAULT_REMINDER_TIME = '20:00'

export interface NudgeInput {
  /** Local date and time right now. */
  now: Date
  /** The chosen time, or undefined when reminders are off. */
  time: string | undefined
  /** Tasks still to do today. */
  pending: number
  /** The day a reminder was last shown, so there is at most one per day. */
  lastNudgeDate: DateStr | undefined
  today: DateStr
}

/** Whether to remind now: it is on, the time has come, something is left, and today's reminder has not been shown. */
export function shouldNudge({ now, time, pending, lastNudgeDate, today }: NudgeInput): boolean {
  if (!isValidTime(time) || pending <= 0 || lastNudgeDate === today) return false
  const [h, m] = time.split(':').map(Number)
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m
}
