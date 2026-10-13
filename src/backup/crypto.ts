import { BackupError } from "./errors";

/**
 * Backup file layout (all integers big-endian):
 *
 *   plain:      "DQBK" | version u8 | flags u8 | container
 *   encrypted:  "DQBK" | version u8 | flags u8 | iterations u32 | salt 16 | chunkSize u32 | chunks…
 *
 * Encrypted files hold the container as AES-256-GCM chunks of `chunkSize` plaintext bytes (+16 byte tag each).
 * The key comes from PBKDF2-HMAC-SHA256 over the NFKC-normalized password and a random per-file salt.
 *
 * Because every file gets a fresh salt (so a fresh key), a counter is a safe IV: 12 bytes, the chunk index in the
 * last four. Each chunk authenticates the whole header, its index, and whether it is the last chunk, so changing
 * the header, reordering chunks or cutting the file short all fail to decrypt.
 *
 * Chunking means a big photo backup never needs to sit in memory as one buffer: chunks are read from and
 * written to Blobs one at a time.
 */

export const FORMAT_VERSION = 1;
const MAGIC = new Uint8Array([0x44, 0x51, 0x42, 0x4b]); // "DQBK"
const FLAG_ENCRYPTED = 0b1;
const PLAIN_HEADER_BYTES = 6;
const ENCRYPTED_HEADER_BYTES = 30;
const SALT_BYTES = 16;
const TAG_BYTES = 16;

export const DEFAULT_ITERATIONS = 600_000;
const MAX_ITERATIONS = 10_000_000;
export const DEFAULT_CHUNK_BYTES = 1 << 20;
const MAX_CHUNK_BYTES = 64 << 20;

export interface EncryptOptions {
  /** PBKDF2 iterations. Only tests lower this. */
  iterations?: number;
  /** Plaintext bytes per chunk. Only tests lower this. */
  chunkBytes?: number;
}

interface Header {
  encrypted: boolean;
  /** The exact header bytes, authenticated by every chunk. */
  bytes: Uint8Array;
  iterations: number;
  salt: Uint8Array;
  chunkBytes: number;
}

function u32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function chunkIv(index: number): Uint8Array {
  const iv = new Uint8Array(12);
  new DataView(iv.buffer).setUint32(8, index);
  return iv;
}

function chunkAad(
  header: Uint8Array,
  index: number,
  isLast: boolean,
): Uint8Array {
  return concat(header, u32(index), new Uint8Array([isLast ? 1 : 0]));
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function readHeader(file: Blob): Promise<Header> {
  const first = new Uint8Array(
    await file.slice(0, ENCRYPTED_HEADER_BYTES).arrayBuffer(),
  );
  if (
    first.length < PLAIN_HEADER_BYTES ||
    !MAGIC.every((b, i) => first[i] === b)
  ) {
    throw new BackupError(
      "not-a-backup",
      "Missing the Daily Quest file marker.",
    );
  }
  const flags = first[5];
  if (first[4] !== FORMAT_VERSION || (flags & ~FLAG_ENCRYPTED) !== 0) {
    throw new BackupError(
      "unsupported-version",
      `File format ${first[4]} is not supported.`,
    );
  }
  if (!(flags & FLAG_ENCRYPTED)) {
    return {
      encrypted: false,
      bytes: first.slice(0, PLAIN_HEADER_BYTES),
      iterations: 0,
      salt: new Uint8Array(),
      chunkBytes: 0,
    };
  }
  if (first.length < ENCRYPTED_HEADER_BYTES)
    throw new BackupError("damaged", "The file header is cut short.");
  const view = new DataView(first.buffer, first.byteOffset, first.byteLength);
  const iterations = view.getUint32(6);
  const chunkBytes = view.getUint32(26);
  if (iterations < 1 || iterations > MAX_ITERATIONS)
    throw new BackupError("damaged", "The file header is invalid.");
  if (chunkBytes < 1 || chunkBytes > MAX_CHUNK_BYTES)
    throw new BackupError("damaged", "The file header is invalid.");
  return {
    encrypted: true,
    bytes: first.slice(0, ENCRYPTED_HEADER_BYTES),
    iterations,
    salt: first.slice(10, 10 + SALT_BYTES),
    chunkBytes,
  };
}

/** Reads just the header: is this a backup, and does it need a password? */
export async function inspectBackup(
  file: Blob,
): Promise<{ encrypted: boolean }> {
  const { encrypted } = await readHeader(file);
  return { encrypted };
}

/** Wraps a container in the file format, encrypting it when a password is given. */
export async function encodeBackup(
  container: Blob,
  password?: string,
  options: EncryptOptions = {},
): Promise<Blob> {
  if (password === undefined) {
    return new Blob([MAGIC, new Uint8Array([FORMAT_VERSION, 0]), container]);
  }
  if (password === "") throw new Error("Password cannot be empty.");

  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const header = concat(
    MAGIC,
    new Uint8Array([FORMAT_VERSION, FLAG_ENCRYPTED]),
    u32(iterations),
    salt,
    u32(chunkBytes),
  );
  const key = await deriveKey(password, salt, iterations);

  const count = Math.max(1, Math.ceil(container.size / chunkBytes));
  let out = new Blob([header as BlobPart]);
  for (let i = 0; i < count; i++) {
    const plain = await container
      .slice(i * chunkBytes, (i + 1) * chunkBytes)
      .arrayBuffer();
    const sealed = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: chunkIv(i) as BufferSource,
        additionalData: chunkAad(header, i, i === count - 1) as BufferSource,
        tagLength: 128,
      },
      key,
      plain,
    );
    out = new Blob([out, sealed]);
  }
  return out;
}

/** Unwraps a backup file and returns the container. Needs the password when the file is encrypted. */
export async function decodeBackup(
  file: Blob,
  password?: string,
): Promise<Blob> {
  const header = await readHeader(file);
  if (!header.encrypted) return file.slice(PLAIN_HEADER_BYTES);
  if (password === undefined || password === "") {
    throw new BackupError("password-required", "This backup is encrypted.");
  }

  const body = file.size - ENCRYPTED_HEADER_BYTES;
  if (body < TAG_BYTES)
    throw new BackupError("damaged", "The file has no data.");
  const key = await deriveKey(password, header.salt, header.iterations);
  const stride = header.chunkBytes + TAG_BYTES;
  const count = Math.ceil(body / stride);

  let out = new Blob([]);
  for (let i = 0; i < count; i++) {
    const start = ENCRYPTED_HEADER_BYTES + i * stride;
    const sealed = await file
      .slice(start, Math.min(file.size, start + stride))
      .arrayBuffer();
    try {
      const plain = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: chunkIv(i) as BufferSource,
          additionalData: chunkAad(
            header.bytes,
            i,
            i === count - 1,
          ) as BufferSource,
          tagLength: 128,
        },
        key,
        sealed,
      );
      out = new Blob([out, plain]);
    } catch {
      // Chunk 0 failing most likely means a wrong password. A later chunk failing, with chunk 0 fine, means damage.
      throw i === 0
        ? new BackupError("wrong-password", "The first block did not unlock.")
        : new BackupError(
            "damaged",
            "Part of the file was changed or cut short.",
          );
    }
  }
  return out;
}
