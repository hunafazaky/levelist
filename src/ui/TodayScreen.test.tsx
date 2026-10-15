// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeOccurrence, createTask, runCatchUp } from '../db/repo'
import { db } from '../db/schema'
import { TodayScreen } from './TodayScreen'

// jsdom has no <dialog> modal support, no object URLs, and no image decoding.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
  URL.createObjectURL = () => 'blob:test'
  URL.revokeObjectURL = () => {}
})

vi.mock('../media/image', () => ({
  compressImage: async (file: File) => ({ blob: file, mime: file.type, width: 10, height: 10 }),
}))

const TODAY = '2026-10-04'

beforeEach(async () => {
  await db.delete()
  await db.open()
})
afterEach(cleanup)

describe('TodayScreen', () => {
  it('shows the empty state with a way to add a first task', async () => {
    render(<TodayScreen today={TODAY} onGoToTasks={() => {}} />)
    expect(await screen.findByText('No tasks yet')).toBeTruthy()
  })

  it('shows a rest-day message when tasks exist but none is scheduled today', async () => {
    await createTask(db, { title: 'Gym', recurrence: { type: 'weekdays', days: [1] } }, TODAY) // Sunday today; Mondays only
    render(<TodayScreen today={TODAY} onGoToTasks={() => {}} />)
    expect(await screen.findByText('Nothing scheduled today')).toBeTruthy()
  })

  it('cannot mark a task done without a photo, then completes it with one and awards 100 XP', async () => {
    const user = userEvent.setup()
    await createTask(db, { title: 'Jogging', recurrence: { type: 'daily' } }, TODAY)
    await runCatchUp(db, TODAY)
    render(<TodayScreen today={TODAY} onGoToTasks={() => {}} />)

    await user.click(await screen.findByRole('button', { name: 'Add proof' }))
    const dialog = await screen.findByRole('dialog', { name: 'Jogging' })
    const confirm = within(dialog).getByRole('button', { name: /Mark done/ }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    const file = new File(['bytes'], 'run.jpg', { type: 'image/jpeg' })
    await user.upload(dialog.querySelector('input[type=file]') as HTMLInputElement, file)
    await waitFor(() => expect(confirm.disabled).toBe(false))
    await user.click(confirm)

    await screen.findByLabelText('View proof for Jogging')
    expect(screen.getByText('1 of 1 done')).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText('100 XP in total')).toBeTruthy())
    expect(await db.ledger.count()).toBe(1)
    expect(await db.proofs.count()).toBe(1)
  })

  describe('day forecast', () => {
    async function twoTasks() {
      const a = await createTask(db, { title: 'Jogging', recurrence: { type: 'daily' } }, TODAY)
      await createTask(db, { title: 'Reading', recurrence: { type: 'daily' } }, TODAY)
      await runCatchUp(db, TODAY)
      return a
    }
    const photo = { blob: new Blob(['x'], { type: 'image/jpeg' }), mime: 'image/jpeg' }
    const standing = (label: string) => screen.getByText(label).parentElement!.textContent

    it('warns about the penalty while nothing is done', async () => {
      await twoTasks()
      render(<TodayScreen today={TODAY} onGoToTasks={() => {}} />)
      expect(
        await screen.findByText('Finish one task to keep your streak and avoid \u2212100 XP at midnight.'),
      ).toBeTruthy()
      expect(standing('Day streak')).toBe('Day streak0')
    })

    it('shows the streak bonus and what finishing everything would earn, and counts the streak', async () => {
      const a = await twoTasks()
      await completeOccurrence(db, `${a.id}_${TODAY}`, photo, TODAY)
      render(<TodayScreen today={TODAY} onGoToTasks={() => {}} />)
      expect(
        await screen.findByText('Streak kept: +50 XP at midnight. Finish everything for +100 XP instead.'),
      ).toBeTruthy()
      expect(standing('Day streak')).toBe('Day streak1')
      expect(standing('Perfect streak')).toBe('Perfect streak0')
    })

    it('announces a perfect day once everything is done', async () => {
      const a = await twoTasks()
      const b = (await db.occurrences.where('date').equals(TODAY).toArray()).find((o) => o.taskId !== a.id)!
      await completeOccurrence(db, `${a.id}_${TODAY}`, photo, TODAY)
      await completeOccurrence(db, b.id, photo, TODAY)
      render(<TodayScreen today={TODAY} onGoToTasks={() => {}} />)
      expect(await screen.findByText('Perfect day. +100 XP bonus at midnight.')).toBeTruthy()
      expect(standing('Perfect streak')).toBe('Perfect streak1')
    })
  })

  it('shows a finished task that has no photo (restored from a backup without photos) as done, not as needing proof', async () => {
    const t = await createTask(db, { title: 'Jogging', recurrence: { type: 'daily' } }, TODAY)
    await runCatchUp(db, TODAY)
    await db.occurrences.update(`${t.id}_${TODAY}`, { status: 'done', completedAt: 1 })
    render(<TodayScreen today={TODAY} onGoToTasks={() => {}} />)
    expect(await screen.findByText('No photo')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add proof' })).toBeNull()
    expect(screen.getByText('1 of 1 done')).toBeTruthy()
  })
})
