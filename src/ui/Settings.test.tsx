// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/schema'
import { clearErrorLog, logError } from '../diagnostics/errorLog'
import { setLang } from '../i18n'
import { getReminderTime } from '../reminders/reminders'
import { ReminderCard } from './ReminderCard'
import { ReportCard } from './ReportCard'
import { StorageProblem } from './StorageProblem'

beforeEach(async () => {
  setLang('en')
  localStorage.clear()
  clearErrorLog()
  await db.delete()
  await db.open()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubNotification(permission: NotificationPermission, requestResult: NotificationPermission = permission) {
  const N = vi.fn() as unknown as typeof Notification & { permission: NotificationPermission; requestPermission: () => Promise<NotificationPermission> }
  N.permission = permission
  N.requestPermission = vi.fn(async () => {
    N.permission = requestResult
    return requestResult
  })
  vi.stubGlobal('Notification', N)
  return N
}

describe('ReminderCard', () => {
  it('says so when the browser cannot show notifications', async () => {
    vi.stubGlobal('Notification', undefined)
    render(<ReminderCard />)
    expect(await screen.findByText("This browser can't show notifications.")).toBeTruthy()
  })

  it('asks permission when turned on, saves a default time, and lets the time change', async () => {
    const N = stubNotification('default', 'granted')
    render(<ReminderCard />)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Remind me if tasks are left' }))
    expect(N.requestPermission).toHaveBeenCalledOnce()
    const time = await screen.findByLabelText('Remind me at')
    expect((time as HTMLInputElement).value).toBe('20:00')
    expect(await getReminderTime()).toBe('20:00')

    fireEvent.change(time, { target: { value: '07:30' } })
    await waitFor(async () => expect(await getReminderTime()).toBe('07:30'))
  })

  it('stays off and explains when permission is refused', async () => {
    stubNotification('default', 'denied')
    render(<ReminderCard />)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Remind me if tasks are left' }))
    expect(await screen.findByText(/Notifications are blocked for this site/)).toBeTruthy()
    expect(await getReminderTime()).toBeUndefined()
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
  })

  it('turns off and forgets the time', async () => {
    stubNotification('granted')
    await db.meta.put({ key: 'reminderTime', value: '19:00' })
    render(<ReminderCard />)
    const box = await screen.findByRole('checkbox', { name: 'Remind me if tasks are left' })
    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(true))
    await userEvent.click(box)
    await waitFor(async () => expect(await getReminderTime()).toBeUndefined())
    expect(screen.queryByLabelText('Remind me at')).toBeNull()
  })
})

describe('ReportCard', () => {
  it('shows how many problems are recorded and clears them', async () => {
    render(<ReportCard />)
    expect(screen.getByText('No problems recorded on this device.')).toBeTruthy()
    logError('error', new Error('boom'))
    expect(await screen.findByText('1 problem recorded on this device.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(await screen.findByText('No problems recorded on this device.')).toBeTruthy()
  })

  it('copies the report, or shows it for copying by hand when the clipboard is unavailable', async () => {
    logError('error', new Error('boom'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ReportCard />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy report' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Error: boom'))
    expect(await screen.findByText('Copied.')).toBeTruthy()

    writeText.mockRejectedValue(new Error('denied'))
    await userEvent.click(screen.getByRole('button', { name: 'Copy report' }))
    expect(((await screen.findByRole('textbox', { name: 'Problem report' })) as HTMLTextAreaElement).value).toContain('Error: boom')
  })
})

describe('StorageProblem', () => {
  it('explains what to try', () => {
    render(<StorageProblem />)
    expect(screen.getByRole('alert').textContent).toContain("Can't open your data")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
