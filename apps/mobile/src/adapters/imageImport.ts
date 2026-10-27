import { fitWithin } from "../domain/customLayout.js";

/** Long-edge cap for stored photos; keeps decode memory sane on phones. */
export const MAX_PHOTO_EDGE = 2048;

export interface ImportedImage {
  blob: Blob;
  width: number;
  height: number;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Decodes a picked file (EXIF orientation applied) and re-encodes it downscaled. */
export async function importImage(file: Blob, maxEdge = MAX_PHOTO_EDGE): Promise<ImportedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    // Browsers without a WebP encoder silently return PNG; use JPEG then.
    const webp = await canvasToBlob(canvas, "image/webp", 0.88);
    const blob = webp?.type === "image/webp" ? webp : await canvasToBlob(canvas, "image/jpeg", 0.88);
    if (!blob) throw new Error("Could not encode the image");
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
