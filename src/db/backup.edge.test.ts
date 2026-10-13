import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { BackupError, createBackupFile, openBackupFile } from "../backup";
import { exportBackup, importBackup } from "./backup";
import { archiveTask, createTask, runCatchUp } from "./repo";
import { QuestDB } from "./schema";

let n = 0;
const fresh = async () => {
  const db = new QuestDB(`edge-${n++}`);
  await db.open();
  return db;
};
const NOW = 1_759_000_000_000;

/** B has one daily task on Oct 9; A starts as a copy of B. */
async function twoDevices() {
  const b = await fresh();
  const task = await createTask(
    b,
    { title: "Read", recurrence: { type: "daily" } },
    "2026-10-09",
    NOW,
  );
  await runCatchUp(b, "2026-10-09", NOW);
  const a = await fresh();
  await importBackup(
    a,
    await exportBackup(b, { now: NOW }),
    "replace",
    "2026-10-09",
    NOW,
  );
  return { a, b, task };
}

const rows = async (db: QuestDB) => ({
  days: (await db.days.orderBy("date").toArray()).map(
    (d) => `${d.date}:${d.outcome}`,
  ),
  occurrences: (await db.occurrences.orderBy("date").toArray()).map(
    (o) => `${o.date}:${o.status}`,
  ),
  xp: (await db.ledger.toArray()).map((e) => `${e.id}:${e.delta}`).sort(),
});

describe("merge when a task was deleted on one device", () => {
  it("does not bring back a pending occurrence the other device still had on the day it was deleted", async () => {
    const { a, b, task } = await twoDevices();
    await archiveTask(a, task.id, "2026-10-09", NOW + 10); // deleted on A on Oct 9, before doing it
    await importBackup(
      a,
      await exportBackup(b, { now: NOW + 20 }),
      "merge",
      "2026-10-11",
      NOW + 30,
    ); // B never heard

    expect((await a.tasks.get(task.id))?.archivedOn).toBe("2026-10-09");
    expect(await rows(a)).toEqual({ days: [], occurrences: [], xp: [] });
  });

  it("drops the other device's missed days after the delete, but keeps the ones before it", async () => {
    const { a, b, task } = await twoDevices();
    await archiveTask(a, task.id, "2026-10-10", NOW + 10);
    await runCatchUp(b, "2026-10-12", NOW + 15); // B: Oct 9, 10, 11 expired; Oct 12 pending
    await importBackup(
      a,
      await exportBackup(b, { now: NOW + 20 }),
      "merge",
      "2026-10-12",
      NOW + 30,
    );

    // Oct 9 was a real day for this task and was never done. From Oct 10 the task did not exist.
    expect(await rows(a)).toEqual({
      days: ["2026-10-09:broken"],
      occurrences: ["2026-10-09:expired"],
      xp: ["day_2026-10-09:-100"],
    });
  });

  it("still keeps a task finished on the other device after the delete: the work was done", async () => {
    const { a, b, task } = await twoDevices();
    await archiveTask(a, task.id, "2026-10-09", NOW + 10);
    const { completeOccurrence } = await import("./repo");
    await completeOccurrence(
      b,
      `${task.id}_2026-10-09`,
      { blob: new Blob(["P"], { type: "image/webp" }), mime: "image/webp" },
      "2026-10-09",
      NOW + 15,
    );
    await importBackup(
      a,
      await exportBackup(b, { now: NOW + 20 }),
      "merge",
      "2026-10-11",
      NOW + 30,
    );
    expect((await rows(a)).occurrences).toEqual(["2026-10-09:done"]);
  });
});

describe("a file that contradicts itself is refused", () => {
  async function contents() {
    const b = await fresh();
    await createTask(
      b,
      { title: "Read", recurrence: { type: "daily" } },
      "2026-10-09",
      NOW,
    );
    await runCatchUp(b, "2026-10-09", NOW);
    return exportBackup(b, { now: NOW });
  }
  const open = async (c: Awaited<ReturnType<typeof contents>>) =>
    openBackupFile(await createBackupFile(c, undefined));

  it("rejects an occurrence of a task the file does not have", async () => {
    const c = await contents();
    c.occurrences = c.occurrences.map((o) => ({
      ...o,
      taskId: "ghost",
      id: `ghost_${o.date}`,
    }));
    await expect(open(c)).rejects.toBeInstanceOf(BackupError);
  });

  it("rejects an occurrence whose id does not match its task and day", async () => {
    const c = await contents();
    c.occurrences = c.occurrences.map((o) => ({ ...o, id: "something-else" }));
    await expect(open(c)).rejects.toBeInstanceOf(BackupError);
  });

  it("rejects two entries for the same task and day", async () => {
    const c = await contents();
    c.occurrences = [...c.occurrences, { ...c.occurrences[0], id: "dup" }];
    await expect(open(c)).rejects.toBeInstanceOf(BackupError);
  });
});
