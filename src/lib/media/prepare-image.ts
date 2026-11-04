import { placement } from "./crop";
import type { View } from "./crop";

export const LOGO_SIZE = 512;
export const PHOTO_SIZE = 384;
export const MAX_UPLOAD_BYTES = 307200;
export const JPEG_QUALITY = 0.82;

export class ImageTooLargeError extends Error {
  constructor() {
    super("image_too_large");
    this.name = "ImageTooLargeError";
  }
}

export function readImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

export async function renderPicture(bitmap: ImageBitmap, view: View, frame: number, size: number, fill: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("canvas_unavailable");
  context.fillStyle = fill;
  context.fillRect(0, 0, size, size);
  context.imageSmoothingQuality = "high";
  const at = placement(view, bitmap, frame, size);
  context.drawImage(bitmap, at.x, at.y, at.width, at.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (blob === null) throw new Error("encode_failed");
  if (blob.size > MAX_UPLOAD_BYTES) throw new ImageTooLargeError();
  return blob;
}
