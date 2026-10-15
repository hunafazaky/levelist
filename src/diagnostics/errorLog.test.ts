// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { buildReport, clearErrorLog, installErrorLog, logError, readErrorLog } from './errorLog'

beforeEach(() => {
  localStorage.clear()
  clearErrorLog()
})

describe('error log', () => {
  it('records an error with its name, message and stack', () => {
    logError('error', new TypeError('boom'), 1000)
    const [entry] = readErrorLog()
    expect(entry).toMatchObject({ at: 1000, source: 'error', message: 'TypeError: boom' })
    expect(entry.stack).toContain('boom')
  })

  it('accepts things that are not Error objects', () => {
    logError('promise', 'plain text')
    logError('promise', undefined)
    expect(readErrorLog().map((e) => e.message)).toEqual(['plain text', 'undefined'])
  })

  it('keeps only the most recent 30 and trims long text', () => {
    for (let i = 0; i < 40; i++) logError('error', new Error(`e${i}`))
    const entries = readErrorLog()
    expect(entries).toHaveLength(30)
    expect(entries[0].message).toBe('Error: e10')
    logError('error', 'x'.repeat(5000))
    expect(readErrorLog().at(-1)!.message.length).toBeLessThan(600)
  })

  it('survives blocked storage by keeping entries in memory', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
    try {
      expect(() => logError('error', new Error('still logged'))).not.toThrow()
    } finally {
      Storage.prototype.setItem = original
    }
    expect(readErrorLog().map((e) => e.message)).toEqual(['Error: still logged'])
  })

  it('records uncaught errors and unhandled rejections once installed', () => {
    installErrorLog(window)
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('uncaught'), message: 'uncaught' }))
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown }
    rejection.reason = new Error('rejected')
    window.dispatchEvent(rejection)
    expect(readErrorLog().map((e) => e.message)).toEqual(['Error: uncaught', 'Error: rejected'])
  })

  it('builds a report with version details and the recorded errors', () => {
    logError('error', new Error('boom'), Date.UTC(2026, 9, 13))
    const report = buildReport({ version: '0.1.0', language: 'id', userAgent: 'TestBrowser/1', standalone: true })
    expect(report).toContain('Daily Quest 0.1.0')
    expect(report).toContain('Installed as app: yes')
    expect(report).toContain('2026-10-13T00:00:00.000Z [error] Error: boom')
    clearErrorLog()
    expect(buildReport({ version: '0.1.0', language: 'en', userAgent: 'x', standalone: false })).toContain('No errors recorded.')
  })
})
