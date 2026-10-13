import { decodeBackup, encodeBackup, type EncryptOptions } from "./crypto";
import {
  decodeContainer,
  encodeContainer,
  type BackupContents,
} from "./container";

export { BackupError, describeBackupError } from "./errors";
export type { BackupContents } from "./container";
export { inspectBackup } from "./crypto";

/** Contents to file bytes, encrypted when a password is given. */
export async function createBackupFile(
  contents: BackupContents,
  password?: string,
  options?: EncryptOptions,
): Promise<Blob> {
  return encodeBackup(encodeContainer(contents), password, options);
}

/** File bytes to validated contents. Throws BackupError. */
export async function openBackupFile(
  file: Blob,
  password?: string,
): Promise<BackupContents> {
  return decodeContainer(await decodeBackup(file, password));
}
