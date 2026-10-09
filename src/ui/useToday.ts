import { useEffect, useState } from 'react'
import { CONFIG } from '../domain/config'
import { toDateStr, type DateStr } from '../domain/dates'

const currentDay = () => toDateStr(new Date(), CONFIG.dayStartHour)

/** Today's date, kept current across midnight and when the app returns from the background. */
export function useToday(): DateStr {
  const [today, setToday] = useState(currentDay)

  useEffect(() => {
    const refresh = () => setToday(currentDay())
    const timer = window.setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return today
}
