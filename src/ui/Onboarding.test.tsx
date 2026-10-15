// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTask } from '../db/repo'
import { db } from '../db/schema'
import { setLang } from '../i18n'
import { App } from './App'

vi.mock('../pwa/state', () => ({
  pwa: { applyUpdate: () => {}, dismissOfflineReady: () => {} },
  usePwaState: () => ({ updateReady: false, offlineReady: false }),
}))

beforeEach(async () => {
  setLang('en')
  await db.delete()
  await db.open()
})
afterEach(cleanup)

describe('first run', () => {
  it('welcomes someone with no tasks, walks through the rules, and can add an example task', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome to Daily Quest' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add "Read 10 pages"' }))

    expect(await screen.findByText('Read 10 pages')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Welcome to Daily Quest' })).toBeNull()
    expect(await db.tasks.count()).toBe(1)
  })

  it('can be skipped, and never comes back', async () => {
    const { unmount } = render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Skip' }))
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy()
    expect(await db.tasks.count()).toBe(0)
    unmount()

    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Welcome to Daily Quest' })).toBeNull()
  })

  it('does not welcome someone who already has tasks (an older install)', async () => {
    await createTask(db, { title: 'Jogging', recurrence: { type: 'daily' } }, '2026-10-04')
    render(<App />)
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Welcome to Daily Quest' })).toBeNull())
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy()
  })

  it('switches language on the welcome screen', async () => {
    render(<App />)
    await userEvent.selectOptions(await screen.findByLabelText('Language'), 'id')
    expect(await screen.findByRole('heading', { name: 'Selamat datang di Daily Quest' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('id')
  })
})
