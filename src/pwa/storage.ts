export interface StorageStatus {
  supported: boolean
  /** True when the browser promised not to clear this app's data on its own. */
  persisted: boolean
  usageBytes?: number
  quotaBytes?: number
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage?.persisted) return { supported: false, persisted: false }
  const [persisted, estimate] = await Promise.all([
    storage.persisted(),
    storage.estimate ? storage.estimate().catch(() => undefined) : Promise.resolve(undefined),
  ])
  return { supported: true, persisted, usageBytes: estimate?.usage, quotaBytes: estimate?.quota }
}

/**
 * Asks the browser to keep this app's data even when the device is low on space. Some browsers decide on their
 * own (for installed apps, say) and some ask the person, so call it after something the person just did.
 * Resolves with whether the data is now protected. Never throws.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
    if (!storage?.persist) return false
    if (await storage.persisted()) return true
    return await storage.persist()
  } catch {
    return false
  }
}
