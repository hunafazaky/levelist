import { useSyncExternalStore } from "react";

export interface PwaState {
  /** A new version has been downloaded and is waiting for the person to reload. */
  updateReady: boolean;
  /** The app has just been saved for offline use. Shown once. */
  offlineReady: boolean;
}

const INITIAL: PwaState = { updateReady: false, offlineReady: false };

let state = INITIAL;
let apply: (() => void) | undefined;
const listeners = new Set<() => void>();

function set(next: Partial<PwaState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/**
 * Where the service worker reports to the UI. Kept apart from registration (which needs the build tool's
 * virtual module) so components can use it, and be tested, without a service worker.
 */
export const pwa = {
  updateReady(applyUpdate: () => void) {
    apply = applyUpdate;
    set({ updateReady: true });
  },
  offlineReady() {
    set({ offlineReady: true });
  },
  dismissOfflineReady() {
    set({ offlineReady: false });
  },
  applyUpdate() {
    apply?.();
  },
  /** For tests. */
  reset() {
    apply = undefined;
    state = INITIAL;
    listeners.forEach((l) => l());
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribe, () => state);
}
