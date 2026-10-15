import { LANGUAGES, getLang, setLang, type Lang } from '../i18n'
import { t } from '../i18n'

/** Changing it remounts the app (see App), so every screen picks up the new language at once. */
export function LanguagePicker({ id }: { id: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{t('Language')}</label>
      <select id={id} value={getLang()} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  )
}
