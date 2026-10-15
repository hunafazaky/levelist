import { registerSW } from 'virtual:pwa-register'
import { pwa } from './state'

const HOUR = 60 * 60 * 1000

/** Registers the service worker that keeps the app working offline. Call once, from main.tsx. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  const update = registerSW({
    onNeedRefresh() {
      pwa.updateReady(() => void update(true))
    },
    onOfflineReady() {
      pwa.offlineReady()
    },
    onRegisteredSW(_url, registration) {
      // A phone app can stay open for days; look for a new version now and then.
      if (registration) window.setInterval(() => void registration.update().catch(() => {}), HOUR)
    },
    onRegisterError(error) {
      console.error('Could not set up offline support.', error)
    },
  })
}
