// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissBackupReminder, markExported } from "../db/backup";
import { db } from "../db/schema";
import { initInstall } from "../pwa/install";
import { pwa } from "../pwa/state";
import { AppCard } from "./AppCard";
import { BackupReminder } from "./BackupReminder";
import { UpdateBanner } from "./UpdateBanner";

beforeEach(async () => {
  await db.delete();
  await db.open();
  pwa.reset();
});
afterEach(() => {
  cleanup();
  delete (navigator as { storage?: unknown }).storage;
});

const earned = (date: string) =>
  db.ledger.add({
    id: `task_complete_${date}`,
    date,
    kind: "task_complete",
    delta: 100,
    createdAt: 0,
  });

describe("UpdateBanner", () => {
  it("shows nothing until there is news", () => {
    const { container } = render(<UpdateBanner />);
    expect(container.textContent).toBe("");
  });

  it("offers a reload when a new version is waiting, and reloads only when asked", async () => {
    const apply = vi.fn();
    render(<UpdateBanner />);
    act(() => pwa.updateReady(apply));
    expect(screen.getByText("A new version is ready.")).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(apply).toHaveBeenCalledOnce();
  });

  it("tells the person once that the app now works offline, and can be dismissed", async () => {
    render(<UpdateBanner />);
    act(() => pwa.offlineReady());
    expect(screen.getByText(/works without a connection/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByText(/works without a connection/)).toBeNull();
  });

  it("puts a waiting update ahead of the offline message", () => {
    render(<UpdateBanner />);
    act(() => {
      pwa.offlineReady();
      pwa.updateReady(() => {});
    });
    expect(screen.getByText("A new version is ready.")).toBeTruthy();
    expect(screen.queryByText(/Saved for offline use/)).toBeNull();
  });
});

describe("BackupReminder", () => {
  const TODAY = "2026-10-14";

  it("says nothing before anything has been earned", async () => {
    const { container } = render(
      <BackupReminder today={TODAY} onOpen={() => {}} />,
    );
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("reminds a week after the first activity when there is no backup yet", async () => {
    await earned("2026-10-07");
    render(<BackupReminder today={TODAY} onOpen={() => {}} />);
    expect(
      await screen.findByText(/You haven't made a backup yet/),
    ).toBeTruthy();
  });

  it("is not due earlier than a week", async () => {
    await earned("2026-10-10");
    const { container } = render(
      <BackupReminder today={TODAY} onOpen={() => {}} />,
    );
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("counts the days since the last export, and opens the Backup screen", async () => {
    await earned("2026-09-01");
    await markExported(db, new Date(2026, 9, 2, 12).getTime());
    const onOpen = vi.fn();
    render(<BackupReminder today={TODAY} onOpen={onOpen} />);
    expect(
      await screen.findByText("Your last backup was 12 days ago."),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Back up now" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('"Later" hides it for today, and it comes back the next day', async () => {
    await earned("2026-09-01");
    const view = render(<BackupReminder today={TODAY} onOpen={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.queryByText(/backup/i)).toBeNull());

    view.unmount();
    render(<BackupReminder today="2026-10-15" onOpen={() => {}} />);
    expect(
      await screen.findByText(/You haven't made a backup yet/),
    ).toBeTruthy();
  });

  it("disappears by itself once a backup is exported", async () => {
    await earned("2026-09-01");
    render(<BackupReminder today={TODAY} onOpen={() => {}} />);
    await screen.findByText(/You haven't made a backup yet/);
    await markExported(db, new Date(2026, 9, 14, 9).getTime());
    await waitFor(() => expect(screen.queryByText(/backup/i)).toBeNull());
  });

  it('stays gone after "Later" even if the dismissal is the only thing stored', async () => {
    await earned("2026-09-01");
    await dismissBackupReminder(db, TODAY);
    const { container } = render(
      <BackupReminder today={TODAY} onOpen={() => {}} />,
    );
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});

describe("AppCard", () => {
  function stubStorage(
    persisted: boolean,
    persist: () => Promise<boolean> = async () => false,
  ) {
    const storage = {
      persisted: vi.fn().mockResolvedValue(persisted),
      persist: vi.fn().mockImplementation(persist),
      estimate: vi
        .fn()
        .mockResolvedValue({ usage: 2 * 1024 * 1024, quota: 1e9 }),
    };
    Object.defineProperty(navigator, "storage", {
      value: storage,
      configurable: true,
    });
    return storage;
  }

  it("says when storage is protected, with how much is used", async () => {
    stubStorage(true);
    render(<AppCard />);
    expect(
      await screen.findByText(
        /Protected\. The browser won't clear your data on its own\. Using 2\.0 MB\./,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Protect my data" }),
    ).toBeNull();
  });

  it("offers to protect unprotected storage, and says plainly when the browser refuses", async () => {
    const storage = stubStorage(false, async () => false);
    render(<AppCard />);
    expect(await screen.findByText(/Not protected/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Protect my data" }),
    );
    expect(storage.persist).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(/Your browser didn't allow it/),
    ).toBeTruthy();
  });

  it("shows protection once the browser agrees", async () => {
    const storage = stubStorage(false);
    storage.persist.mockImplementation(async () => {
      storage.persisted.mockResolvedValue(true);
      return true;
    });
    render(<AppCard />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Protect my data" }),
    );
    expect(await screen.findByText(/Protected\./)).toBeTruthy();
  });

  it("is honest when the browser can't say", async () => {
    render(<AppCard />);
    expect(
      await screen.findByText(/can't say whether your data is protected/),
    ).toBeTruthy();
  });

  it("reports offline readiness", async () => {
    render(<AppCard />);
    expect(screen.getByText(/Not ready yet/)).toBeTruthy();
    act(() => pwa.offlineReady());
    expect(
      await screen.findByText("Ready. The app works without a connection."),
    ).toBeTruthy();
  });

  it("shows an Install button only when the browser offers one, and uses it once", async () => {
    initInstall();
    render(<AppCard />);
    expect(screen.queryByRole("button", { name: "Install app" })).toBeNull();

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(
      new Event("beforeinstallprompt", { cancelable: true }),
      {
        prompt,
        userChoice: Promise.resolve({ outcome: "accepted" as const }),
      },
    );
    act(() => {
      window.dispatchEvent(event);
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Install app" }),
    );
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Install app" })).toBeNull(),
    );
  });
});
