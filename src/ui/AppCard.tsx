import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { promptInstall, useInstallState } from '../pwa/install'
import { usePwaState } from '../pwa/state'
import { getStorageStatus, requestPersistence, type StorageStatus } from '../pwa/storage'
import { formatBytes } from './format'

/** Install, offline and storage status for this device. Lives on the Backup screen: all of it is about keeping data safe. */
export function AppCard() {
  const install = useInstallState()
  const { offlineReady } = usePwaState()
  const [controlled, setControlled] = useState(() => 'serviceWorker' in navigator && !!navigator.serviceWorker.controller)
  const [storage, setStorage] = useState<StorageStatus>()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    void getStorageStatus().then(setStorage)
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const update = () => setControlled(!!navigator.serviceWorker.controller)
    navigator.serviceWorker.addEventListener('controllerchange', update)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', update)
  }, [])

  async function onProtect() {
    setBusy(true)
    setNote(null)
    const ok = await requestPersistence()
    setStorage(await getStorageStatus())
    if (!ok) {
      setNote(t("Your browser didn't allow it. Installing the app usually helps. Until then, export a backup now and then."))
    }
    setBusy(false)
  }

  async function onInstall() {
    setBusy(true)
    await promptInstall()
    setBusy(false)
  }

  const offline = offlineReady || controlled

  return (
    <section className="panel" aria-labelledby="app-h">
      <h2 id="app-h">{t('This app')}</h2>
      <div className="facts">
        <div>
          <h3 className="fact__label">{t('Offline')}</h3>
          <p className="fact__text">
            {offline
              ? t('Ready. The app works without a connection.')
              : t('Not ready yet. Open the app once while online and it saves itself.')}
          </p>
        </div>

        <div>
          <h3 className="fact__label">{t('Install')}</h3>
          <p className="fact__text">
            {install === 'installed' && t('Installed on this device.')}
            {install === 'available' && t('Add it to your home screen to open it like any other app.')}
            {install === 'ios' && t('On iPhone or iPad, tap Share, then Add to Home Screen.')}
            {install === 'unavailable' && t("Use your browser's menu and look for Install app or Add to Home screen.")}
          </p>
          {install === 'available' && (
            <div className="actions">
              <button type="button" className="btn btn--primary" onClick={onInstall} disabled={busy}>
                {t('Install app')}
              </button>
            </div>
          )}
        </div>

        <div>
          <h3 className="fact__label">{t('Storage')}</h3>
          <p className="fact__text">
            {storage === undefined
              ? ''
              : !storage.supported
                ? t("This browser can't say whether your data is protected. Export a backup now and then.")
                : storage.persisted
                  ? t("Protected. The browser won't clear your data on its own.")
                  : t('Not protected. The browser can clear your data if the device runs low on space.')}
            {storage?.supported && storage.usageBytes !== undefined && ` ${t('Using {size}.', { size: formatBytes(storage.usageBytes) })}`}
          </p>
          {storage?.supported && !storage.persisted && (
            <div className="actions">
              <button type="button" className="btn btn--primary" onClick={onProtect} disabled={busy}>
                {t('Protect my data')}
              </button>
            </div>
          )}
          {note && (
            <p className="hint" role="status">
              {note}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
