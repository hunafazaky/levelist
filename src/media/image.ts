const MAX_EDGE = 1280;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

export interface CompressedImage {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

/**
 * Downscales a photo to at most 1280px on the long edge and re-encodes it (WebP, falling back to JPEG).
 * Phone photos are 3-8 MB; this keeps each proof around 100-250 KB so the local database and exports stay small.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > MAX_INPUT_BYTES)
    throw new Error("That photo is too large. Try one under 30 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "This browser can't read that image format. Try a JPEG or PNG photo.",
    );
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process the photo.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Browsers that cannot encode WebP silently return PNG, so check the type we got back.
    const webp = await canvasToBlob(canvas, "image/webp", 0.8);
    if (webp && webp.type === "image/webp")
      return { blob: webp, mime: "image/webp", width, height };
    const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.82);
    if (jpeg) return { blob: jpeg, mime: "image/jpeg", width, height };
    throw new Error("Could not process the photo.");
  } finally {
    bitmap.close();
  }
}
