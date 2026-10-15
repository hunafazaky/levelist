import { t } from '../i18n'
import { pwa, usePwaState } from '../pwa/state'

/** Tells the person when a new version is waiting, or that the app can now work offline. */
export function UpdateBanner() {
  const { updateReady, offlineReady } = usePwaState()

  if (updateReady) {
    return (
      <div className="notice" role="status">
        <p>{t('A new version is ready.')}</p>
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={() => pwa.applyUpdate()}>
            {t('Reload')}
          </button>
        </div>
      </div>
    )
  }
  if (offlineReady) {
    return (
      <div className="notice" role="status">
        <p>{t('Saved for offline use. The app now works without a connection.')}</p>
        <div className="actions">
          <button type="button" className="btn" onClick={() => pwa.dismissOfflineReady()}>
            {t('OK')}
          </button>
        </div>
      </div>
    )
  }
  return null
}
