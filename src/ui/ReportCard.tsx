import { useState, useSyncExternalStore } from 'react'
import { buildReport, clearErrorLog, readErrorLog, subscribeErrorLog } from '../diagnostics/errorLog'
import { getLang, t } from '../i18n'
import { isStandalone } from '../pwa/install'
import { plural } from './format'

/** Lets someone who hit a problem copy a plain-text report. Everything stays on the device until they paste it. */
export function ReportCard() {
  const entries = useSyncExternalStore(subscribeErrorLog, readErrorLog)
  const [shown, setShown] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const report = () =>
    buildReport({ version: __APP_VERSION__, language: getLang(), userAgent: navigator.userAgent, standalone: isStandalone() })

  async function copy() {
    const text = report()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setShown(null)
    } catch {
      // No clipboard access: show the text so it can be selected by hand.
      setCopied(false)
      setShown(text)
    }
  }

  return (
    <section className="panel" aria-labelledby="report-h">
      <h2 id="report-h">{t('Problem report')}</h2>
      <p className="muted">
        {entries.length === 0
          ? t('No problems recorded on this device.')
          : t('{problems} recorded on this device.', { problems: plural(entries.length, 'problem') })}
      </p>
      <p className="hint">
        {t('If something goes wrong, copy the report and send it to whoever runs the app. It holds no tasks or photos, and it is never sent unless you send it.')}
      </p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => void copy()}>
          {t('Copy report')}
        </button>
        {entries.length > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearErrorLog()
              setShown(null)
              setCopied(false)
            }}
          >
            {t('Clear')}
          </button>
        )}
      </div>
      <p className="hint" role="status">
        {copied ? t('Copied.') : ''}
      </p>
      {shown && (
        <textarea
          className="report"
          readOnly
          rows={8}
          value={shown}
          aria-label={t('Problem report')}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </section>
  )
}
