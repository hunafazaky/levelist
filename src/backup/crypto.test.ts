import { describe, expect, it } from "vitest";
import {
  DEFAULT_ITERATIONS,
  decodeBackup,
  encodeBackup,
  inspectBackup,
} from "./crypto";
import { BackupError } from "./errors";

const fast = { iterations: 1000 };
const blobOf = (bytes: Uint8Array) => new Blob([bytes as BlobPart]);
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const sample = (n: number) =>
  Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) % 256);

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no error";
  } catch (e) {
    return e instanceof BackupError ? e.code : `other: ${String(e)}`;
  }
}

describe("plain backups", () => {
  it("round-trips and starts with the file marker", async () => {
    const data = sample(1000);
    const file = await encodeBackup(blobOf(data));
    const head = await bytesOf(file.slice(0, 4));
    expect(String.fromCharCode(...head)).toBe("DQBK");
    expect(await inspectBackup(file)).toEqual({ encrypted: false });
    expect(await bytesOf(await decodeBackup(file))).toEqual(data);
  });
});

describe("encrypted backups", () => {
  it("round-trips with the right password and reports itself as encrypted", async () => {
    const data = sample(5000);
    const file = await encodeBackup(
      blobOf(data),
      "correct horse battery",
      fast,
    );
    expect(await inspectBackup(file)).toEqual({ encrypted: true });
    expect(
      await bytesOf(await decodeBackup(file, "correct horse battery")),
    ).toEqual(data);
  });

  it("does not contain the plaintext", async () => {
    const secret = new TextEncoder().encode(
      "Jogging every Sunday with proof photo",
    );
    const file = await bytesOf(
      await encodeBackup(blobOf(secret), "a password", fast),
    );
    expect(new TextDecoder("latin1").decode(file)).not.toContain("Jogging");
  });

  it("produces different files each time (fresh salt)", async () => {
    const data = blobOf(sample(100));
    const a = await bytesOf(await encodeBackup(data, "pw-12345", fast));
    const b = await bytesOf(await encodeBackup(data, "pw-12345", fast));
    expect(a).not.toEqual(b);
  });

  it("spans many chunks and handles sizes at chunk boundaries", async () => {
    for (const size of [1, 15, 16, 17, 32, 33, 160, 1000]) {
      const data = sample(size);
      const file = await encodeBackup(blobOf(data), "pw-12345", {
        ...fast,
        chunkBytes: 16,
      });
      expect(await bytesOf(await decodeBackup(file, "pw-12345"))).toEqual(data);
    }
  });

  it("handles an empty container", async () => {
    const file = await encodeBackup(blobOf(new Uint8Array()), "pw-12345", fast);
    expect((await decodeBackup(file, "pw-12345")).size).toBe(0);
  });

  it("asks for a password when none is given", async () => {
    const file = await encodeBackup(blobOf(sample(50)), "pw-12345", fast);
    expect(await code(decodeBackup(file))).toBe("password-required");
    expect(await code(decodeBackup(file, ""))).toBe("password-required");
  });

  it("rejects a wrong password", async () => {
    const file = await encodeBackup(blobOf(sample(50)), "pw-12345", fast);
    expect(await code(decodeBackup(file, "pw-12346"))).toBe("wrong-password");
  });

  it("treats equivalent Unicode spellings of a password as the same", async () => {
    const composed = "café-pass";
    const decomposed = "café-pass";
    const file = await encodeBackup(blobOf(sample(50)), composed, fast);
    expect((await decodeBackup(file, decomposed)).size).toBe(50);
  });

  it("refuses to encrypt with an empty password", async () => {
    await expect(encodeBackup(blobOf(sample(5)), "")).rejects.toThrow();
  });

  it("works with the real default of 600,000 iterations", async () => {
    expect(DEFAULT_ITERATIONS).toBe(600_000);
    const data = sample(300);
    const file = await encodeBackup(blobOf(data), "a real passphrase");
    expect(
      await bytesOf(await decodeBackup(file, "a real passphrase")),
    ).toEqual(data);
  }, 30_000);
});

describe("tampering is detected", () => {
  const chunk = { ...fast, chunkBytes: 16 };
  const HEADER = 30;
  const STRIDE = 16 + 16;

  async function sealed() {
    return bytesOf(await encodeBackup(blobOf(sample(100)), "pw-12345", chunk)); // 7 chunks
  }

  it("flipping a header byte (salt, iterations, chunk size) fails", async () => {
    for (const at of [10, 26, 7]) {
      const bytes = await sealed();
      bytes[at] ^= 1;
      expect(["wrong-password", "damaged"]).toContain(
        await code(decodeBackup(blobOf(bytes), "pw-12345")),
      );
    }
  });

  it("flipping a byte in a later chunk reports damage, not a wrong password", async () => {
    const bytes = await sealed();
    bytes[HEADER + 3 * STRIDE + 2] ^= 1;
    expect(await code(decodeBackup(blobOf(bytes), "pw-12345"))).toBe("damaged");
  });

  it("cutting chunks off the end fails", async () => {
    const bytes = await sealed();
    const cut = bytes.slice(0, HEADER + 5 * STRIDE);
    expect(["wrong-password", "damaged"]).toContain(
      await code(decodeBackup(blobOf(cut), "pw-12345")),
    );
  });

  it("swapping two chunks fails", async () => {
    const bytes = await sealed();
    const a = bytes.slice(HEADER + STRIDE, HEADER + 2 * STRIDE);
    const b = bytes.slice(HEADER + 2 * STRIDE, HEADER + 3 * STRIDE);
    bytes.set(b, HEADER + STRIDE);
    bytes.set(a, HEADER + 2 * STRIDE);
    expect(await code(decodeBackup(blobOf(bytes), "pw-12345"))).toBe("damaged");
  });

  it("appending bytes fails", async () => {
    const bytes = await sealed();
    const longer = new Uint8Array(bytes.length + 5);
    longer.set(bytes);
    expect(["wrong-password", "damaged"]).toContain(
      await code(decodeBackup(blobOf(longer), "pw-12345")),
    );
  });
});

describe("files that are not usable backups", () => {
  it("rejects arbitrary files", async () => {
    expect(await code(inspectBackup(blobOf(sample(100))))).toBe("not-a-backup");
    expect(await code(inspectBackup(new Blob([])))).toBe("not-a-backup");
    expect(await code(inspectBackup(new Blob(["PK\u0003\u0004zipfile"])))).toBe(
      "not-a-backup",
    );
  });

  it("rejects a newer format version and unknown feature flags", async () => {
    const file = await bytesOf(await encodeBackup(blobOf(sample(10))));
    const newer = file.slice();
    newer[4] = 2;
    expect(await code(inspectBackup(blobOf(newer)))).toBe(
      "unsupported-version",
    );
    const flagged = file.slice();
    flagged[5] = 0b10;
    expect(await code(inspectBackup(blobOf(flagged)))).toBe(
      "unsupported-version",
    );
  });

  it("rejects headers with absurd parameters instead of trying them", async () => {
    const file = await bytesOf(
      await encodeBackup(blobOf(sample(10)), "pw-12345", fast),
    );
    const huge = file.slice();
    new DataView(huge.buffer).setUint32(6, 4_000_000_000);
    expect(await code(decodeBackup(blobOf(huge), "pw-12345"))).toBe("damaged");
    const zeroChunk = file.slice();
    new DataView(zeroChunk.buffer).setUint32(26, 0);
    expect(await code(decodeBackup(blobOf(zeroChunk), "pw-12345"))).toBe(
      "damaged",
    );
  });

  it("rejects an encrypted file with a cut-off header", async () => {
    const file = await bytesOf(
      await encodeBackup(blobOf(sample(10)), "pw-12345", fast),
    );
    expect(
      await code(decodeBackup(blobOf(file.slice(0, 20)), "pw-12345")),
    ).toBe("damaged");
  });
});
