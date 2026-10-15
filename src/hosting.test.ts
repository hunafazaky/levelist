import { describe, expect, it } from 'vitest'

// Both hosting files live at the project root. Read them as text.
const vercelText = Object.values(import.meta.glob('/vercel.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0]
const renderText = Object.values(import.meta.glob('/render.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0]

const fromVercel = (): string[] => {
  const config = JSON.parse(vercelText) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
  return config.headers.flatMap((rule) =>
    rule.headers
      .filter((h) => h.key !== 'Content-Type')
      .map((h) => `${rule.source.replace('/(.*)', '/*')} | ${h.key} | ${h.value}`),
  )
}

const fromRender = (): string[] => {
  const out: string[] = []
  let path = ''
  let name = ''
  for (const line of renderText.split('\n')) {
    const p = /^\s*- path: (.+)$/.exec(line)
    const n = /^\s*name: (.+)$/.exec(line)
    const v = /^\s*value: "(.*)"$/.exec(line)
    if (p) path = p[1]
    else if (n && path) name = n[1]
    else if (v && path && name && !/^\d+$/.test(v[1])) {
      out.push(`${path} | ${name} | ${v[1]}`)
      name = ''
    }
  }
  return out
}

describe('hosting config', () => {
  it('sends the same headers on Vercel and on Render', () => {
    expect(fromRender().sort()).toEqual(fromVercel().sort())
  })

  it('never caches the service worker and caches built files for a year', () => {
    const headers = fromVercel()
    expect(headers).toContain('/sw.js | Cache-Control | no-cache')
    expect(headers).toContain('/assets/* | Cache-Control | public, max-age=31536000, immutable')
  })

  it('has a content security policy that allows nothing from other sites', () => {
    const csp = fromVercel().find((h) => h.includes('Content-Security-Policy'))!
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:\/\//)
  })
})
