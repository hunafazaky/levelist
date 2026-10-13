export type BackupErrorCode =
  | "not-a-backup"
  | "unsupported-version"
  | "password-required"
  | "wrong-password"
  | "damaged";

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  constructor(code: BackupErrorCode, message: string) {
    super(message);
    this.name = "BackupError";
    this.code = code;
  }
}

/** Plain-language text for the person using the app. Says what went wrong and what to do. */
export function describeBackupError(e: unknown): string {
  if (e instanceof BackupError) {
    switch (e.code) {
      case "not-a-backup":
        return "That file isn't a Daily Quest backup. Choose a file made with Export.";
      case "unsupported-version":
        return "This backup was made by a newer version of the app. Update the app, then try again.";
      case "password-required":
        return "This backup is encrypted. Enter its password.";
      case "wrong-password":
        return "Wrong password, or the file is damaged. Check the password and try again.";
      case "damaged":
        return `The backup is damaged and can't be imported. ${e.message}`.trim();
    }
  }
  return "Something went wrong while reading the file. Try again.";
}
