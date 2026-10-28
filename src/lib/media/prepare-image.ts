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

export function squareCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

export async function prepareImage(file: Blob, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("canvas_unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (blob === null) throw new Error("encode_failed");
    if (blob.size > MAX_UPLOAD_BYTES) throw new ImageTooLargeError();
    return blob;
  } finally {
    bitmap.close();
  }
}
