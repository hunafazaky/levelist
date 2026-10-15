import { db } from '../db/schema'
import type { DateStr } from '../domain/dates'
import { isValidTime } from '../domain/nudge'
import { t } from '../i18n'

const TIME_KEY = 'reminderTime'
const LAST_KEY = 'reminderLastDate'

/** Device-local settings: never part of a backup, so restoring one never turns reminders on somewhere else. */
export async function getReminderTime(): Promise<string | undefined> {
  const row = await db.meta.get(TIME_KEY)
  return isValidTime(row?.value) ? row.value : undefined
}

export async function setReminderTime(time: string | undefined): Promise<void> {
  if (time === undefined) await db.meta.delete(TIME_KEY)
  else if (isValidTime(time)) await db.meta.put({ key: TIME_KEY, value: time })
}

export async function getLastNudgeDate(): Promise<DateStr | undefined> {
  const row = await db.meta.get(LAST_KEY)
  return typeof row?.value === 'string' ? row.value : undefined
}

export const markNudged = (today: DateStr) => db.meta.put({ key: LAST_KEY, value: today })

export type NotificationSupport = 'unsupported' | 'default' | 'granted' | 'denied'

export function notificationSupport(): NotificationSupport {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Must be called from a tap. Resolves with the final permission. */
export async function askForPermission(): Promise<NotificationSupport> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/**
 * Shows the reminder. Android Chrome only allows notifications made through the service worker, desktop allows both,
 * so use the worker when there is one. Resolves with whether anything was shown.
 */
export async function showReminder(pending: number): Promise<boolean> {
  if (notificationSupport() !== 'granted') return false
  const title = 'Daily Quest'
  const options: NotificationOptions = {
    body: pending === 1 ? t('1 task is still waiting today.') : t('{n} tasks are still waiting today.', { n: pending }),
    icon: '/icons/icon-192.png',
    tag: 'daily-reminder',
  }
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (registration) await registration.showNotification(title, options)
    else new Notification(title, options)
    return true
  } catch {
    return false
  }
}
