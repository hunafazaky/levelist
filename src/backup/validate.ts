import { isDateStr } from "../domain/dates";
import { validateRecurrence, type Recurrence } from "../domain/recurrence";
import type {
  DayRecord,
  LedgerEntry,
  LedgerKind,
  Occurrence,
  Task,
} from "../db/types";
import { BackupError } from "./errors";

export const SCHEMA_VERSION = 1;

export const BACKUP_META_KEYS = [
  "lastCatchUpDate",
  "lastFinalizedDate",
] as const;

export interface ProofEntry {
  id: string;
  mime: string;
  createdAt: number;
  size: number;
}

export interface Manifest {
  app: "daily-quest";
  schema: number;
  exportedAt: number;
  tasks: Task[];
  occurrences: Occurrence[];
  days: DayRecord[];
  ledger: LedgerEntry[];
  meta: Record<string, string>;
  proofs: ProofEntry[];
}

type Obj = Record<string, unknown>;

function fail(where: string, problem: string): never {
  throw new BackupError("damaged", `Problem at ${where}: ${problem}.`);
}

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(where, "expected a list");
  return v;
}

function obj(v: unknown, where: string): Obj {
  if (!isObj(v)) fail(where, "expected an object");
  return v;
}

function str(o: Obj, key: string, where: string, max = 300, min = 1): string {
  const v = o[key];
  if (typeof v !== "string" || v.length < min || v.length > max)
    fail(`${where}.${key}`, "expected text");
  return v;
}

function num(o: Obj, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v))
    fail(`${where}.${key}`, "expected a number");
  return v;
}

function count(o: Obj, key: string, where: string): number {
  const v = num(o, key, where);
  if (!Number.isInteger(v) || v < 0)
    fail(`${where}.${key}`, "expected a whole number");
  return v;
}

function date(o: Obj, key: string, where: string): string {
  const v = str(o, key, where, 10, 10);
  if (!isDateStr(v)) fail(`${where}.${key}`, "expected a date");
  return v;
}

function optStr(o: Obj, key: string, where: string): string | undefined {
  return o[key] === undefined ? undefined : str(o, key, where);
}

function oneOf<T extends string>(
  o: Obj,
  key: string,
  where: string,
  allowed: readonly T[],
): T {
  const v = o[key];
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v))
    fail(`${where}.${key}`, "unknown value");
  return v as T;
}

function recurrence(v: unknown, where: string): Recurrence {
  const o = obj(v, where);
  const type = oneOf(o, "type", where, [
    "daily",
    "weekdays",
    "interval",
  ] as const);
  let r: Recurrence;
  if (type === "daily") {
    r = { type };
  } else if (type === "weekdays") {
    const days = arr(o.days, `${where}.days`);
    if (!days.every((d) => typeof d === "number"))
      fail(`${where}.days`, "expected numbers");
    r = { type, days: days as number[] };
  } else {
    r = {
      type,
      every: num(o, "every", where),
      anchor: date(o, "anchor", where),
    };
  }
  const problem = validateRecurrence(r);
  if (problem) fail(where, problem.replace(/\.$/, ""));
  return r;
}

const STATUSES = ["pending", "done", "expired"] as const;
const LEDGER_KINDS: readonly LedgerKind[] = [
  "task_complete",
  "day_perfect",
  "day_streak",
  "day_broken",
  "day_rest",
];
const STORED_OUTCOMES = ["rest", "perfect", "streak", "broken"] as const;

/**
 * Checks everything in a parsed backup before any of it touches the database, so a damaged or hand-edited file
 * is rejected instead of putting odd data in front of the app. Throws BackupError.
 */
export function validateManifest(raw: unknown): Manifest {
  const root = obj(raw, "file");
  if (root.app !== "daily-quest")
    throw new BackupError("not-a-backup", "This file is not from this app.");
  const schema = count(root, "schema", "file");
  if (schema > SCHEMA_VERSION)
    throw new BackupError(
      "unsupported-version",
      `Data version ${schema} is newer.`,
    );

  const tasks = arr(root.tasks, "tasks").map((v, i): Task => {
    const w = `tasks[${i}]`;
    const o = obj(v, w);
    const archivedOn =
      o.archivedOn === undefined ? undefined : date(o, "archivedOn", w);
    return {
      id: str(o, "id", w, 100),
      title: str(o, "title", w, 120),
      recurrence: recurrence(o.recurrence, `${w}.recurrence`),
      createdOn: date(o, "createdOn", w),
      ...(archivedOn !== undefined ? { archivedOn } : {}),
      createdAt: num(o, "createdAt", w),
      updatedAt: num(o, "updatedAt", w),
    };
  });

  const occurrences = arr(root.occurrences, "occurrences").map(
    (v, i): Occurrence => {
      const w = `occurrences[${i}]`;
      const o = obj(v, w);
      const proofId = optStr(o, "proofId", w);
      return {
        id: str(o, "id", w, 250),
        taskId: str(o, "taskId", w, 100),
        date: date(o, "date", w),
        title: str(o, "title", w, 120),
        status: oneOf(o, "status", w, STATUSES),
        ...(proofId !== undefined ? { proofId } : {}),
        ...(o.completedAt !== undefined
          ? { completedAt: num(o, "completedAt", w) }
          : {}),
      };
    },
  );

  const days = arr(root.days, "days").map((v, i): DayRecord => {
    const w = `days[${i}]`;
    const o = obj(v, w);
    return {
      date: date(o, "date", w),
      outcome: oneOf(o, "outcome", w, STORED_OUTCOMES),
      scheduled: count(o, "scheduled", w),
      done: count(o, "done", w),
    };
  });

  const ledger = arr(root.ledger, "ledger").map((v, i): LedgerEntry => {
    const w = `ledger[${i}]`;
    const o = obj(v, w);
    const refId = optStr(o, "refId", w);
    return {
      id: str(o, "id", w, 300),
      date: date(o, "date", w),
      kind: oneOf(o, "kind", w, LEDGER_KINDS),
      delta: num(o, "delta", w),
      ...(refId !== undefined ? { refId } : {}),
      createdAt: num(o, "createdAt", w),
    };
  });

  const metaRaw = obj(root.meta, "meta");
  const meta: Record<string, string> = {};
  for (const key of BACKUP_META_KEYS) {
    if (metaRaw[key] !== undefined) meta[key] = date(metaRaw, key, "meta");
  }

  const proofs = arr(root.proofs, "proofs").map((v, i): ProofEntry => {
    const w = `proofs[${i}]`;
    const o = obj(v, w);
    const mime = str(o, "mime", w, 100);
    if (!/^image\/[a-z0-9.+-]+$/i.test(mime))
      fail(`${w}.mime`, "expected an image type");
    return {
      id: str(o, "id", w, 100),
      mime,
      createdAt: num(o, "createdAt", w),
      size: count(o, "size", w),
    };
  });

  // An occurrence is identified by its task and day. Anything else would let one day count twice, or hang off a
  // task the file does not contain.
  const taskIds = new Set(tasks.map((t) => t.id));
  for (const [i, o] of occurrences.entries()) {
    if (!taskIds.has(o.taskId))
      fail(`occurrences[${i}].taskId`, "the task is missing");
    if (o.id !== `${o.taskId}_${o.date}`)
      fail(`occurrences[${i}].id`, "does not match its task and day");
  }

  const proofIds = new Set(proofs.map((p) => p.id));
  if (proofIds.size !== proofs.length) fail("proofs", "duplicate photo ids");
  for (const [i, o] of occurrences.entries()) {
    if (o.proofId !== undefined && !proofIds.has(o.proofId))
      fail(`occurrences[${i}].proofId`, "photo is missing");
  }
  for (const [name, list] of [
    ["tasks", tasks],
    ["occurrences", occurrences],
    ["ledger", ledger],
  ] as const) {
    if (new Set(list.map((x) => x.id)).size !== list.length)
      fail(name, "duplicate ids");
  }
  if (new Set(days.map((d) => d.date)).size !== days.length)
    fail("days", "duplicate dates");

  return {
    app: "daily-quest",
    schema,
    exportedAt: num(root, "exportedAt", "file"),
    tasks,
    occurrences,
    days,
    ledger,
    meta,
    proofs,
  };
}
