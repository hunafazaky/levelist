import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStorageStatus, requestPersistence } from './storage'

afterEach(() => vi.unstubAllGlobals())

const stubStorage = (storage: Partial<StorageManager> | undefined) => vi.stubGlobal('navigator', { storage })

describe('getStorageStatus', () => {
  it('says so when the browser has no storage API', async () => {
    stubStorage(undefined)
    expect(await getStorageStatus()).toEqual({ supported: false, persisted: false })
  })

  it('reports protection and usage', async () => {
    stubStorage({
      persisted: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockResolvedValue({ usage: 1234, quota: 5_000_000 }),
    })
    expect(await getStorageStatus()).toEqual({ supported: true, persisted: true, usageBytes: 1234, quotaBytes: 5_000_000 })
  })

  it('still reports protection when the usage estimate fails', async () => {
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), estimate: vi.fn().mockRejectedValue(new Error('no')) })
    expect(await getStorageStatus()).toMatchObject({ supported: true, persisted: false, usageBytes: undefined })
  })
})

describe('requestPersistence', () => {
  it('asks the browser and reports a yes', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist })
    expect(await requestPersistence()).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it('reports a no without throwing', async () => {
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) })
    expect(await requestPersistence()).toBe(false)
  })

  it('does not ask again when the data is already protected', async () => {
    const persist = vi.fn()
    stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist })
    expect(await requestPersistence()).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('returns false when unsupported or when the browser throws', async () => {
    stubStorage(undefined)
    expect(await requestPersistence()).toBe(false)
    stubStorage({ persisted: vi.fn().mockRejectedValue(new Error('blocked')), persist: vi.fn() })
    expect(await requestPersistence()).toBe(false)
  })
})
