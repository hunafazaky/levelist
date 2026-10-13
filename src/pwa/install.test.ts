// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module keeps the install prompt in module state, so every test loads a fresh copy.
async function load() {
  vi.resetModules();
  const mod = await import("./install");
  mod.initInstall();
  return mod;
}

function promptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  return Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  });
}

const setUserAgent = (ua: string) =>
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });

beforeEach(() => {
  setUserAgent("Mozilla/5.0 (X11; Linux x86_64) Chrome/130");
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as { userAgent?: string }).userAgent;
});

describe("install", () => {
  it("has nothing to offer until the browser sends the install prompt", async () => {
    const { installState } = await load();
    expect(installState()).toBe("unavailable");
  });

  it("keeps the browser prompt for later and shows it once when asked", async () => {
    const { installState, promptInstall } = await load();
    const event = promptEvent("accepted");
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); // the browser must not show its own bar first
    expect(installState()).toBe("available");

    expect(await promptInstall()).toBe("accepted");
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(installState()).toBe("unavailable"); // a prompt event can only be used once
    expect(await promptInstall()).toBe("unavailable");
  });

  it("reports a dismissal", async () => {
    const { promptInstall } = await load();
    window.dispatchEvent(promptEvent("dismissed"));
    expect(await promptInstall()).toBe("dismissed");
  });

  it("knows when the app was just installed", async () => {
    const { installState } = await load();
    window.dispatchEvent(promptEvent());
    window.dispatchEvent(new Event("appinstalled"));
    expect(installState()).toBe("installed");
  });

  it("knows when it is already running as an installed app", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(display-mode: standalone)",
    }));
    const { installState } = await load();
    expect(installState()).toBe("installed");
  });

  it("points iPhone and iPad users to the Share menu, where no prompt exists", async () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605",
    );
    const { installState } = await load();
    expect(installState()).toBe("ios");
  });

  it("treats a touch Mac (iPadOS) as iOS", async () => {
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605");
    vi.stubGlobal(
      "navigator",
      Object.assign(Object.create(navigator), { maxTouchPoints: 5 }),
    );
    const { isIosBrowser } = await load();
    expect(isIosBrowser()).toBe(true);
  });
});
