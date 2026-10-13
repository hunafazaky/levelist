import type {
  DayRecord,
  LedgerEntry,
  Occurrence,
  Proof,
  Task,
} from "../db/types";
import { BackupError } from "./errors";
import { SCHEMA_VERSION, validateManifest, type Manifest } from "./validate";

/** Everything a backup holds, with photos as Blobs. */
export interface BackupContents {
  exportedAt: number;
  tasks: Task[];
  occurrences: Occurrence[];
  days: DayRecord[];
  ledger: LedgerEntry[];
  /** Only the keys listed in BACKUP_META_KEYS. */
  meta: Record<string, string>;
  proofs: Proof[];
}

const MAX_MANIFEST_BYTES = 256 << 20;

function u32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
}

/**
 * Container layout: manifestLength u32 | manifest (JSON, UTF-8) | photo bytes, back to back in manifest order.
 * Photos stay as Blob parts, so nothing is copied into memory here.
 */
export function encodeContainer(contents: BackupContents): Blob {
  const manifest: Manifest = {
    app: "daily-quest",
    schema: SCHEMA_VERSION,
    exportedAt: contents.exportedAt,
    tasks: contents.tasks,
    occurrences: contents.occurrences,
    days: contents.days,
    ledger: contents.ledger,
    meta: contents.meta,
    proofs: contents.proofs.map((p) => ({
      id: p.id,
      mime: p.mime,
      createdAt: p.createdAt,
      size: p.blob.size,
    })),
  };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  return new Blob([
    u32(json.length) as BlobPart,
    json as BlobPart,
    ...contents.proofs.map((p) => p.blob),
  ]);
}

/** Reads and validates a container. Photos come back as slices of the original Blob. */
export async function decodeContainer(
  container: Blob,
): Promise<BackupContents> {
  if (container.size < 4)
    throw new BackupError("damaged", "The file has no data.");
  const length = new DataView(
    await container.slice(0, 4).arrayBuffer(),
  ).getUint32(0);
  if (length > MAX_MANIFEST_BYTES || 4 + length > container.size) {
    throw new BackupError("damaged", "The file is cut short.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await container.slice(4, 4 + length).text());
  } catch {
    throw new BackupError("damaged", "The data could not be read.");
  }
  const manifest = validateManifest(raw);

  let offset = 4 + length;
  const proofs: Proof[] = [];
  for (const entry of manifest.proofs) {
    const end = offset + entry.size;
    if (end > container.size)
      throw new BackupError("damaged", "A photo is cut short.");
    proofs.push({
      id: entry.id,
      mime: entry.mime,
      createdAt: entry.createdAt,
      blob: container.slice(offset, end, entry.mime),
    });
    offset = end;
  }
  if (offset !== container.size)
    throw new BackupError("damaged", "The file has extra data at the end.");

  return {
    exportedAt: manifest.exportedAt,
    tasks: manifest.tasks,
    occurrences: manifest.occurrences,
    days: manifest.days,
    ledger: manifest.ledger,
    meta: manifest.meta,
    proofs,
  };
}
