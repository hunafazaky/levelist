// @vitest-environment jsdom
import "fake-indexeddb/auto";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectBackup, openBackupFile } from "../backup";
import { lastExportedAt } from "../db/backup";
import { createTask } from "../db/repo";
import { db } from "../db/schema";
import { BackupScreen } from "./BackupScreen";

const downloads = vi.hoisted(() => ({
  last: undefined as { blob: Blob; name: string } | undefined,
}));
vi.mock("./download", () => ({
  downloadBlob: (blob: Blob, name: string) => {
    downloads.last = { blob, name };
  },
}));

const TODAY = "2026-10-06";
const view = () => render(<BackupScreen today={TODAY} />);
const taskTitles = async () =>
  (await db.tasks.toArray()).map((t) => t.title).sort();

async function clearAll() {
  await Promise.all([
    db.tasks.clear(),
    db.occurrences.clear(),
    db.proofs.clear(),
    db.ledger.clear(),
    db.days.clear(),
    db.meta.clear(),
  ]);
}

beforeEach(async () => {
  await db.open();
  await clearAll();
  downloads.last = undefined;
});
afterEach(cleanup);

/** Exports the current database through the screen and returns the file it downloaded. */
async function exportThroughScreen(password?: string): Promise<File> {
  const user = userEvent.setup();
  view();
  if (password) {
    await user.type(screen.getByLabelText("Password (optional)"), password);
    await user.type(screen.getByLabelText("Repeat password"), password);
  }
  await user.click(screen.getByRole("button", { name: "Export backup" }));
  await waitFor(() => expect(downloads.last).toBeDefined(), {
    timeout: 20_000,
  });
  const { blob, name } = downloads.last!;
  cleanup();
  return new File([blob], name);
}

describe("export", () => {
  it("needs a password of at least 8 characters that is typed twice", async () => {
    const user = userEvent.setup();
    view();
    const button = screen.getByRole("button", {
      name: "Export backup",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false); // no password is allowed

    await user.type(screen.getByLabelText("Password (optional)"), "short");
    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();
    expect(button.disabled).toBe(true);

    await user.type(screen.getByLabelText("Password (optional)"), "enough");
    await user.type(screen.getByLabelText("Repeat password"), "differs");
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
    expect(button.disabled).toBe(true);

    await user.clear(screen.getByLabelText("Repeat password"));
    await user.type(screen.getByLabelText("Repeat password"), "shortenough");
    expect(button.disabled).toBe(false);
  });

  it("downloads a plain backup named for today and remembers when", async () => {
    await createTask(
      db,
      { title: "Jogging", recurrence: { type: "daily" } },
      TODAY,
    );
    const file = await exportThroughScreen();
    expect(file.name).toBe("daily-quest-2026-10-06.dqbackup");
    expect(await inspectBackup(file)).toEqual({ encrypted: false });
    expect((await openBackupFile(file)).tasks.map((t) => t.title)).toEqual([
      "Jogging",
    ]);
    expect(await lastExportedAt(db)).toBeGreaterThan(0);
  });

  it("shows the saved file name, then the last export time on return", async () => {
    const user = userEvent.setup();
    view();
    expect(await screen.findByText("You haven't exported yet.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Export backup" }));
    expect(
      await screen.findByText(
        "Saved daily-quest-2026-10-06.dqbackup. Keep it somewhere safe.",
      ),
    ).toBeTruthy();
  });

  it("encrypts the file when a password is set, and clears the password fields", async () => {
    await createTask(
      db,
      { title: "Secret plan", recurrence: { type: "daily" } },
      TODAY,
    );
    const file = await exportThroughScreen("correct horse");
    expect(await inspectBackup(file)).toEqual({ encrypted: true });
    expect(await file.text()).not.toContain("Secret plan");
  }, 30_000);
});

describe("import", () => {
  it("asks for the password, tells a wrong one apart, then merges", async () => {
    await createTask(
      db,
      { title: "Jogging", recurrence: { type: "daily" } },
      TODAY,
    );
    const file = await exportThroughScreen("correct horse");
    await clearAll();
    await createTask(
      db,
      { title: "Already here", recurrence: { type: "daily" } },
      TODAY,
    );

    const user = userEvent.setup();
    view();
    await user.upload(
      document.querySelector("input[type=file]") as HTMLInputElement,
      file,
    );
    expect(await screen.findByText(/is encrypted\./)).toBeTruthy();

    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Wrong password",
    );
    expect(screen.getByLabelText("Password")).toBeTruthy(); // still unlockable

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(
      await screen.findByText(
        /Backup from .*1 task, 0 days of history, 0 photos\./,
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Merge backup" }));
    expect(
      await screen.findByText(
        "Imported. This device now has 2 tasks and 0 photos.",
      ),
    ).toBeTruthy();
    expect(await taskTitles()).toEqual(["Already here", "Jogging"]);
  }, 60_000);

  it("replace needs a second click and then removes what was here", async () => {
    await createTask(
      db,
      { title: "Remote task", recurrence: { type: "daily" } },
      TODAY,
    );
    const file = await exportThroughScreen();
    await clearAll();
    await createTask(
      db,
      { title: "Local task", recurrence: { type: "daily" } },
      TODAY,
    );

    const user = userEvent.setup();
    view();
    await user.upload(
      document.querySelector("input[type=file]") as HTMLInputElement,
      file,
    );
    await screen.findByText(/Backup from/);
    await user.click(
      screen.getByRole("radio", { name: /Replace this device/ }),
    );

    await user.click(
      screen.getByRole("button", { name: "Replace everything" }),
    );
    expect(
      screen.getByRole("button", { name: "Yes, replace everything" }),
    ).toBeTruthy();
    expect(await taskTitles()).toEqual(["Local task"]); // nothing happened yet

    await user.click(
      screen.getByRole("button", { name: "Yes, replace everything" }),
    );
    expect(
      await screen.findByText(
        "Imported. This device now has 1 task and 0 photos.",
      ),
    ).toBeTruthy();
    expect(await taskTitles()).toEqual(["Remote task"]);
  });

  it("switching back to merge cancels a pending replace confirmation", async () => {
    await createTask(
      db,
      { title: "Remote task", recurrence: { type: "daily" } },
      TODAY,
    );
    const file = await exportThroughScreen();
    const user = userEvent.setup();
    view();
    await user.upload(
      document.querySelector("input[type=file]") as HTMLInputElement,
      file,
    );
    await screen.findByText(/Backup from/);
    await user.click(
      screen.getByRole("radio", { name: /Replace this device/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Replace everything" }),
    );
    await user.click(
      screen.getByRole("radio", { name: /Merge with this device/ }),
    );
    await user.click(
      screen.getByRole("radio", { name: /Replace this device/ }),
    );
    expect(
      screen.getByRole("button", { name: "Replace everything" }),
    ).toBeTruthy();
  });

  it("cancel goes back to choosing a file without changing anything", async () => {
    await createTask(
      db,
      { title: "Remote task", recurrence: { type: "daily" } },
      TODAY,
    );
    const file = await exportThroughScreen();
    await clearAll();
    const user = userEvent.setup();
    view();
    await user.upload(
      document.querySelector("input[type=file]") as HTMLInputElement,
      file,
    );
    await screen.findByText(/Backup from/);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Choose backup file")).toBeTruthy();
    expect(await taskTitles()).toEqual([]);
  });

  it("explains when the file is not a backup, and when it is damaged", async () => {
    const user = userEvent.setup();
    view();
    const input = () =>
      document.querySelector("input[type=file]") as HTMLInputElement;

    await user.upload(input(), new File(["just some text"], "notes.txt"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "isn't a Daily Quest backup",
    );

    // right header, nonsense inside
    await user.upload(
      input(),
      new File(
        [new Uint8Array([0x44, 0x51, 0x42, 0x4b, 1, 0, 0, 0, 0, 3, 1, 2, 3])],
        "bad.dqbackup",
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("damaged"),
    );
    expect(await taskTitles()).toEqual([]);
  });

  it("keeps the screen usable after an error: a good file can still be chosen", async () => {
    await createTask(
      db,
      { title: "Jogging", recurrence: { type: "daily" } },
      TODAY,
    );
    const good = await exportThroughScreen();
    await clearAll();
    const user = userEvent.setup();
    view();
    const input = () =>
      document.querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input(), new File(["nope"], "x.txt"));
    await screen.findByRole("alert");
    await user.upload(input(), good);
    expect(await screen.findByText(/Backup from/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    const summary = screen.getByText(/Backup from/).closest("div")!;
    expect(within(summary).getByText(/1 task/)).toBeTruthy();
  });
});
