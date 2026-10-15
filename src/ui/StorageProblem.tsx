import { t } from '../i18n'

/** Shown instead of the app when the database cannot be opened at all. */
export function StorageProblem() {
  return (
    <main className="app welcome">
      <section role="alert" aria-labelledby="storage-h">
        <h1 id="storage-h">{t("Can't open your data")}</h1>
        <p>{t("This browser wouldn't let the app open its storage. Your data has not been changed.")}</p>
        <ul className="plain">
          <li>{t('Private or incognito windows often block storage. Open the app in a normal window.')}</li>
          <li>{t('If the device is almost full, free some space and try again.')}</li>
          <li>{t('Some browser settings and extensions block site storage. Allow it for this site.')}</li>
        </ul>
      </section>
      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          {t('Try again')}
        </button>
      </div>
    </main>
  )
}
