import { useEffect, useRef, useState } from "react";
import { compressImage, type CompressedImage } from "../media/image";
import { CONFIG } from "../domain/config";
import { useObjectUrl } from "./useObjectUrl";

interface Props {
  title: string;
  onConfirm: (proof: { blob: Blob; mime: string }) => Promise<void>;
  onClose: () => void;
}

/** Take a photo, check it, then mark the task done. A task cannot be completed without this step. */
export function ProofSheet({ title, onConfirm, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<CompressedImage>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = useObjectUrl(image?.blob);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setWorking(true);
    try {
      setImage(await compressImage(file));
    } catch (err) {
      setImage(undefined);
      setError(
        err instanceof Error ? err.message : "Could not read that photo.",
      );
    } finally {
      setWorking(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirm() {
    if (!image) return;
    setError(null);
    setWorking(true);
    try {
      await onConfirm({ blob: image.blob, mime: image.mime });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your progress.",
      );
      setWorking(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      onClose={onClose}
      aria-labelledby="proof-title"
    >
      <div className="sheet__body">
        <h2 id="proof-title">{title}</h2>
        <p className="muted">Take a photo as proof that you did it.</p>

        {/* `capture` opens the camera on phones; desktop browsers show a file picker instead. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          id="proof-input"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />

        {url ? (
          <img
            className="preview"
            src={url}
            alt="Preview of your proof photo"
          />
        ) : (
          <label htmlFor="proof-input" className="dropzone" aria-busy={working}>
            {working ? "Preparing photo…" : "Take a photo"}
          </label>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => dialogRef.current?.close()}
            disabled={working}
          >
            Cancel
          </button>
          <span className="spacer" />
          {image && (
            <label
              htmlFor="proof-input"
              className="btn"
              aria-disabled={working}
            >
              Retake
            </label>
          )}
          <button
            type="button"
            className="btn btn--primary"
            onClick={confirm}
            disabled={!image || working}
          >
            Mark done · +{CONFIG.taskXp} XP
          </button>
        </div>
      </div>
    </dialog>
  );
}
