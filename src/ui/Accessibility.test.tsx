// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import axe from 'axe-core'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTask, runCatchUp } from '../db/repo'
import { db } from '../db/schema'
import { setLang } from '../i18n'
import { App } from './App'

vi.mock('../pwa/state', () => ({
  pwa: { applyUpdate: () => {}, dismissOfflineReady: () => {} },
  usePwaState: () => ({ updateReady: false, offlineReady: false }),
}))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

beforeEach(async () => {
  setLang('en')
  await db.delete()
  await db.open()
})
afterEach(cleanup)

/** Rules that need real layout or colors can't run in jsdom; the rest can. */
async function violations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}

describe('accessibility (axe)', () => {
  it('does notice a real problem (so the checks below mean something)', async () => {
    const { container } = render(<img src="x.png" />)
    expect(await violations(container)).toEqual([expect.stringContaining('image-alt')])
  })

  it('has no violations on the welcome screens', async () => {
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'Welcome to Daily Quest' })
    expect(await violations(container)).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await violations(container)).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await violations(container)).toEqual([])
  })

  it.each([
    ['Today', 'Today'],
    ['Tasks', 'Tasks'],
    ['Stats', 'Stats'],
    ['Backup', 'Backup'],
  ])('has no violations on %s, in English and Indonesian', async (_name, tab) => {
    await createTask(db, { title: 'Jogging', recurrence: { type: 'daily' } }, '2026-10-04')
    await runCatchUp(db, '2026-10-04')
    for (const lang of ['en', 'id'] as const) {
      setLang(lang)
      const { container, unmount } = render(<App />)
      const labels = { Today: ['Today', 'Hari ini'], Tasks: ['Tasks', 'Tugas'], Stats: ['Stats', 'Statistik'], Backup: ['Backup', 'Cadangan'] }[tab as 'Today']
      await userEvent.click(await screen.findByRole('button', { name: labels[lang === 'en' ? 0 : 1] }))
      expect(await violations(container)).toEqual([])
      unmount()
    }
  })

  it('has no violations in the task form', async () => {
    await createTask(db, { title: 'Jogging', recurrence: { type: 'daily' } }, '2026-10-04')
    const { container } = render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Tasks' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    await screen.findByRole('heading', { name: 'New task' })
    expect(await violations(container)).toEqual([])
  })
})
