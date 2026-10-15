import { useEffect, useState } from 'react'
import { DEFAULT_REMINDER_TIME, isValidTime } from '../domain/nudge'
import { t } from '../i18n'
import { askForPermission, getReminderTime, notificationSupport, setReminderTime, type NotificationSupport } from '../reminders/reminders'

/** A daily "you still have tasks" notification. It only works while the app is open, and the card says so. */
export function ReminderCard() {
  const [time, setTime] = useState<string>()
  const [loaded, setLoaded] = useState(false)
  const [permission, setPermission] = useState<NotificationSupport>(notificationSupport())

  useEffect(() => {
    void getReminderTime().then((v) => {
      setTime(v)
      setLoaded(true)
    })
  }, [])

  const on = time !== undefined && permission === 'granted'

  async function toggle(checked: boolean) {
    if (!checked) {
      setTime(undefined)
      await setReminderTime(undefined)
      return
    }
    const result = await askForPermission()
    setPermission(result)
    if (result === 'granted') {
      setTime(DEFAULT_REMINDER_TIME)
      await setReminderTime(DEFAULT_REMINDER_TIME)
    }
  }

  async function changeTime(value: string) {
    if (!isValidTime(value)) return
    setTime(value)
    await setReminderTime(value)
  }

  return (
    <section className="panel" aria-labelledby="reminder-h">
      <h2 id="reminder-h">{t('Daily reminder')}</h2>
      {permission === 'unsupported' ? (
        <p className="muted">{t("This browser can't show notifications.")}</p>
      ) : (
        <>
          <div className="check">
            <input
              id="reminder-on"
              type="checkbox"
              checked={on}
              disabled={!loaded || permission === 'denied'}
              onChange={(e) => void toggle(e.target.checked)}
              aria-describedby="reminder-hint"
            />
            <div>
              <label htmlFor="reminder-on">{t('Remind me if tasks are left')}</label>
              <span id="reminder-hint" className="hint">
                {permission === 'denied'
                  ? t('Notifications are blocked for this site. Allow them in your browser settings, then come back.')
                  : t('One reminder a day. It only appears while the app is open or running in the background, not after it is closed.')}
              </span>
            </div>
          </div>
          {on && (
            <div className="field">
              <label htmlFor="reminder-time">{t('Remind me at')}</label>
              <input id="reminder-time" type="time" value={time} onChange={(e) => void changeTime(e.target.value)} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
