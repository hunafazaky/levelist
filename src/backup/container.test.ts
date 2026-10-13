import { describe, expect, it } from "vitest";
import {
  decodeContainer,
  encodeContainer,
  type BackupContents,
} from "./container";
import { BackupError } from "./errors";
import { createBackupFile, openBackupFile } from "./index";

const photo = (text: string, type = "image/webp") => new Blob([text], { type });

function contents(): BackupContents {
  return {
    exportedAt: 1_759_700_000_000,
    tasks: [
      {
        id: "t1",
        title: "Jogging",
        recurrence: { type: "weekdays", days: [0, 2] },
        createdOn: "2026-10-01",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "t2",
        title: "Read",
        recurrence: { type: "interval", every: 3, anchor: "2026-10-01" },
        createdOn: "2026-10-01",
        archivedOn: "2026-10-05",
        createdAt: 1,
        updatedAt: 3,
      },
    ],
    occurrences: [
      {
        id: "t1_2026-10-04",
        taskId: "t1",
        date: "2026-10-04",
        title: "Jogging",
        status: "done",
        proofId: "p1",
        completedAt: 5,
      },
      {
        id: "t1_2026-10-06",
        taskId: "t1",
        date: "2026-10-06",
        title: "Jogging",
        status: "expired",
      },
      {
        id: "t2_2026-10-04",
        taskId: "t2",
        date: "2026-10-04",
        title: "Read",
        status: "done",
        proofId: "p2",
        completedAt: 6,
      },
    ],
    days: [{ date: "2026-10-04", outcome: "perfect", scheduled: 2, done: 2 }],
    ledger: [
      {
        id: "task_complete_t1_2026-10-04",
        date: "2026-10-04",
        kind: "task_complete",
        delta: 100,
        refId: "t1_2026-10-04",
        createdAt: 5,
      },
      {
        id: "day_2026-10-04",
        date: "2026-10-04",
        kind: "day_perfect",
        delta: 100,
        createdAt: 9,
      },
    ],
    meta: { lastCatchUpDate: "2026-10-06", lastFinalizedDate: "2026-10-05" },
    proofs: [
      {
        id: "p1",
        mime: "image/webp",
        createdAt: 5,
        blob: photo("first-photo-bytes"),
      },
      {
        id: "p2",
        mime: "image/jpeg",
        createdAt: 6,
        blob: photo("second", "image/jpeg"),
      },
    ],
  };
}

/** Builds a container from raw manifest JSON plus photo bytes, for crafting bad files. */
function rawContainer(manifest: unknown, ...photos: string[]): Blob {
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, json.length);
  return new Blob([len, json, ...photos]);
}

async function manifestOf(c: BackupContents) {
  const blob = encodeContainer(c);
  const len = new DataView(await blob.slice(0, 4).arrayBuffer()).getUint32(0);
  return JSON.parse(await blob.slice(4, 4 + len).text());
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return "no error";
  } catch (e) {
    return e instanceof BackupError ? e.code : `other: ${String(e)}`;
  }
}

describe("container round trip", () => {
  it("keeps every record and photo, in order", async () => {
    const original = contents();
    const back = await decodeContainer(encodeContainer(original));
    expect(back.tasks).toEqual(original.tasks);
    expect(back.occurrences).toEqual(original.occurrences);
    expect(back.days).toEqual(original.days);
    expect(back.ledger).toEqual(original.ledger);
    expect(back.meta).toEqual(original.meta);
    expect(back.exportedAt).toBe(original.exportedAt);
    expect(back.proofs.map((p) => [p.id, p.mime, p.createdAt])).toEqual([
      ["p1", "image/webp", 5],
      ["p2", "image/jpeg", 6],
    ]);
    expect(await back.proofs[0].blob.text()).toBe("first-photo-bytes");
    expect(await back.proofs[1].blob.text()).toBe("second");
    expect(back.proofs[1].blob.type).toBe("image/jpeg");
  });

  it("handles an empty backup", async () => {
    const empty: BackupContents = {
      exportedAt: 1,
      tasks: [],
      occurrences: [],
      days: [],
      ledger: [],
      meta: {},
      proofs: [],
    };
    expect(await decodeContainer(encodeContainer(empty))).toEqual(empty);
  });

  it("round-trips through the full file, plain and encrypted", async () => {
    const original = contents();
    const plain = await openBackupFile(await createBackupFile(original));
    expect(plain.tasks).toEqual(original.tasks);
    const sealed = await createBackupFile(original, "a passphrase", {
      iterations: 1000,
      chunkBytes: 64,
    });
    const back = await openBackupFile(sealed, "a passphrase");
    expect(back.ledger).toEqual(original.ledger);
    expect(await back.proofs[0].blob.text()).toBe("first-photo-bytes");
    expect(await codeOf(openBackupFile(sealed))).toBe("password-required");
    expect(await codeOf(openBackupFile(sealed, "nope nope"))).toBe(
      "wrong-password",
    );
  });
});

describe("damaged containers", () => {
  it("rejects a file that is too short or has a manifest length past the end", async () => {
    expect(await codeOf(decodeContainer(new Blob([])))).toBe("damaged");
    expect(
      await codeOf(
        decodeContainer(new Blob([new Uint8Array([0, 0, 1, 0, 123])])),
      ),
    ).toBe("damaged");
  });

  it("rejects JSON that cannot be parsed", async () => {
    const bad = new Blob([new Uint8Array([0, 0, 0, 5]), "not{j"]);
    expect(await codeOf(decodeContainer(bad))).toBe("damaged");
  });

  it("rejects photos that are cut short or extra bytes at the end", async () => {
    const m = await manifestOf(contents());
    const short = rawContainer(m, "first-photo-bytes", "sec");
    expect(await codeOf(decodeContainer(short))).toBe("damaged");
    const extra = rawContainer(m, "first-photo-bytes", "second", "EXTRA");
    expect(await codeOf(decodeContainer(extra))).toBe("damaged");
  });

  it("rejects JSON from some other app, and a newer data version", async () => {
    const m = await manifestOf(contents());
    expect(
      await codeOf(decodeContainer(rawContainer({ ...m, app: "other" }))),
    ).toBe("not-a-backup");
    expect(
      await codeOf(
        decodeContainer(
          rawContainer({ ...m, schema: 99 }, "first-photo-bytes", "second"),
        ),
      ),
    ).toBe("unsupported-version");
  });
});

describe("manifest validation", () => {
  async function broken(edit: (m: any) => void) {
    const m = await manifestOf(contents());
    edit(m);
    return codeOf(
      decodeContainer(rawContainer(m, "first-photo-bytes", "second")),
    );
  }

  it("accepts the unedited manifest", async () => {
    expect(await broken(() => {})).toBe("no error");
  });

  it.each([
    ["a task with no title", (m: any) => delete m.tasks[0].title],
    [
      "a task title that is too long",
      (m: any) => (m.tasks[0].title = "x".repeat(121)),
    ],
    ["an invalid date", (m: any) => (m.tasks[0].createdOn = "2026-02-30")],
    [
      "a recurrence with no weekdays",
      (m: any) => (m.tasks[0].recurrence = { type: "weekdays", days: [] }),
    ],
    [
      "a weekday out of range",
      (m: any) => (m.tasks[0].recurrence = { type: "weekdays", days: [9] }),
    ],
    ["an interval of zero days", (m: any) => (m.tasks[1].recurrence.every = 0)],
    [
      "an unknown recurrence type",
      (m: any) => (m.tasks[0].recurrence = { type: "monthly" }),
    ],
    [
      "an unknown occurrence status",
      (m: any) => (m.occurrences[0].status = "maybe"),
    ],
    [
      "a non-numeric timestamp",
      (m: any) => (m.tasks[0].updatedAt = "yesterday"),
    ],
    [
      "an occurrence pointing at a missing photo",
      (m: any) => (m.occurrences[0].proofId = "nope"),
    ],
    [
      "a photo that is not an image",
      (m: any) => (m.proofs[0].mime = "text/html"),
    ],
    ["duplicate photo ids", (m: any) => (m.proofs[1].id = "p1")],
    ["duplicate task ids", (m: any) => (m.tasks[1].id = "t1")],
    ["duplicate day records", (m: any) => m.days.push({ ...m.days[0] })],
    ["a stored paused day", (m: any) => (m.days[0].outcome = "paused")],
    ["a negative day count", (m: any) => (m.days[0].done = -1)],
    ["an unknown ledger kind", (m: any) => (m.ledger[0].kind = "bonus")],
    ["a non-numeric ledger amount", (m: any) => (m.ledger[0].delta = "100")],
    ["a missing list", (m: any) => delete m.ledger],
    ["an invalid meta date", (m: any) => (m.meta.lastCatchUpDate = "soon")],
  ])("rejects %s", async (_name, edit) => {
    expect(await broken(edit)).toBe("damaged");
  });

  it("ignores unknown meta keys instead of importing them", async () => {
    const m = await manifestOf(contents());
    m.meta.lastExportAt = "2026-10-06";
    m.meta.somethingElse = "x";
    const back = await decodeContainer(
      rawContainer(m, "first-photo-bytes", "second"),
    );
    expect(Object.keys(back.meta).sort()).toEqual([
      "lastCatchUpDate",
      "lastFinalizedDate",
    ]);
  });
});
