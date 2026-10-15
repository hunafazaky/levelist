import { useSyncExternalStore } from 'react'
import { id } from './id'

export type Lang = 'en' | 'id'

export const LANGUAGES: readonly { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Bahasa Indonesia' },
]

const STORAGE_KEY = 'dq-lang'
const isLang = (v: unknown): v is Lang => v === 'en' || v === 'id'

/** The saved choice, else the browser's language, else English. Storage can be blocked, so it is only a convenience. */
function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    /* ignore */
  }
  const browser = typeof navigator === 'undefined' ? '' : (navigator.language ?? '')
  return browser.toLowerCase().startsWith('id') ? 'id' : 'en'
}

let current: Lang = detect()
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  for (const l of listeners) l()
}

/** Re-renders the caller when the language changes. Only the root needs it: it remounts the app under a new key. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}

/**
 * Translates `text`. The English text is the key, so English needs no table and an untranslated string
 * falls back to English. `{name}` placeholders are filled from `params`.
 */
export function t(text: string, params?: Record<string, string | number>): string {
  const raw = current === 'id' ? (id[text] ?? text) : text
  return params ? raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`)) : raw
}

if (typeof document !== 'undefined') document.documentElement.lang = current
