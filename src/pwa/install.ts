import { useSyncExternalStore } from "react";

/** The browser's install prompt event. Not in the standard DOM types yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState =
  /** Running as an installed app. */
  | "installed"
  /** The browser offered to install and a button can trigger it. */
  | "available"
  /** iPhone or iPad in Safari: no prompt exists, the person has to use the Share menu. */
  | "ios"
  /** Nothing to offer: already installable some other way, or not supported. */
  | "unavailable";

let deferred: BeforeInstallPromptEvent | undefined;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    nav.standalone === true
  );
}

export function isIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but it has a touch screen.
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

export function installState(): InstallState {
  if (installedNow || isStandalone()) return "installed";
  if (deferred) return "available";
  if (isIosBrowser()) return "ios";
  return "unavailable";
}

/** Catches the install prompt so a button can show it later. Call once, early, from main.tsx. */
export function initInstall(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = undefined;
    installedNow = true;
    notify();
  });
}

/** Shows the browser's install dialog. Resolves with what the person chose. */
export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = undefined; // a prompt event can only be used once
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    installState,
    () => "unavailable",
  );
}
