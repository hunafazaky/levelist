import { afterEach, describe, expect, it } from 'vitest'
import { id } from './id'
import { setLang, t } from './index'

afterEach(() => setLang('en'))

// All app source as text. Tests and the dictionary itself are left out.
const files = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.*', '!./id.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Every `t('literal')` and every word given to `plural(n, 'word')` in the app code. */
function usedKeys(): string[] {
  const keys = new Set<string>()
  for (const code of Object.values(files)) {
    for (const m of code.matchAll(/\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
      keys.add((m[1] ?? m[2]).replace(/\\'/g, "'"))
    }
    for (const m of code.matchAll(/\bplural\([^,]+,\s*'([^']+)'(?:,\s*'([^']+)')?/g)) {
      keys.add(m[1])
      keys.add(m[2] ?? `${m[1]}s`)
    }
  }
  return [...keys]
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('translations', () => {
  it('has an Indonesian text for every text the app shows', () => {
    expect(usedKeys().length).toBeGreaterThan(150) // guards against the scan silently finding nothing
    const missing = usedKeys().filter((k) => !(k in id))
    expect(missing).toEqual([])
  })

  it('keeps the same {placeholders} as the English text', () => {
    const wrong = Object.entries(id).filter(([en, translated]) => placeholders(en).join() !== placeholders(translated).join())
    expect(wrong.map(([en]) => en)).toEqual([])
  })

  it('has no leftover texts the app no longer uses', () => {
    const used = new Set(usedKeys())
    // Texts that reach t() through a variable (error messages thrown elsewhere, achievement texts).
    const indirect = (k: string) =>
      /^(First |Finish |Lose |Choose an|That |This |Give |Keep the|Add a photo|Pick |Weekdays must|Interval |Password cannot|Could not (process|read|save your)|Something went wrong|Wrong password|The backup is)/.test(k)
    const unused = Object.keys(id).filter((k) => !used.has(k) && !indirect(k))
    expect(unused).toEqual([])
  })

  it('fills placeholders and falls back to English for unknown texts', () => {
    expect(t('Level {n}', { n: 4 })).toBe('Level 4')
    setLang('id')
    expect(t('Tasks')).toBe('Tugas')
    expect(t('Not translated anywhere {n}', { n: 2 })).toBe('Not translated anywhere 2')
    expect(t('Every {n} days', { n: 3 })).toBe('Setiap 3 hari')
  })
})
