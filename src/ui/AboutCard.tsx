import { t } from '../i18n'
import { LanguagePicker } from './LanguagePicker'

/** Language, the app version, and a plain statement of what is stored and where. */
export function AboutCard() {
  return (
    <section className="panel" aria-labelledby="about-h">
      <h2 id="about-h">{t('About and privacy')}</h2>
      <LanguagePicker id="about-lang" />
      <ul className="plain">
        <li>{t('Your tasks, photos and XP are stored only in this browser, on this device.')}</li>
        <li>{t('Nothing is sent to a server. There are no accounts, ads or tracking.')}</li>
        <li>
          {t('A backup file contains everything, photos included. Add a password when you export it if you will keep it online.')}
        </li>
        <li>{t('Clearing site data or removing the app deletes your progress unless you have a backup.')}</li>
      </ul>
      <p className="hint">{t('Version {version}', { version: __APP_VERSION__ })}</p>
    </section>
  )
}
