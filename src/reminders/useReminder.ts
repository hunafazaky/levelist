import { useEffect } from 'react'
import { db } from '../db/schema'
import type { DateStr } from '../domain/dates'
import { shouldNudge } from '../domain/nudge'
import { getLastNudgeDate, getReminderTime, markNudged, showReminder } from './reminders'

/** Checks every half minute while the app is open. Reminders cannot arrive while the app is closed. */
export function useReminder(today: DateStr): void {
  useEffect(() => {
    let busy = false
    async function check() {
      if (busy) return
      busy = true
      try {
        const time = await getReminderTime()
        if (time === undefined) return
        const pending = await db.occurrences.where('date').equals(today).filter((o) => o.status === 'pending').count()
        const lastNudgeDate = await getLastNudgeDate()
        if (!shouldNudge({ now: new Date(), time, pending, lastNudgeDate, today })) return
        // Count it as shown even if the browser refused, so a blocked notification is not retried every 30 seconds.
        await markNudged(today)
        await showReminder(pending)
      } finally {
        busy = false
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), 30_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [today])
}
