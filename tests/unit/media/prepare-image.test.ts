import { afterEach, describe, expect, it, vi } from "vitest";
import { JPEG_QUALITY, LOGO_SIZE, MAX_UPLOAD_BYTES, PHOTO_SIZE, ImageTooLargeError, readImage, renderPicture } from "@/lib/media/prepare-image";

describe("sizes", () => {
  it("uses the agreed sizes", () => {
    expect([LOGO_SIZE, PHOTO_SIZE, MAX_UPLOAD_BYTES]).toEqual([512, 384, 307200]);
  });
});

describe("readImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads a phone photo the right way up", async () => {
    const bitmap = { width: 4, height: 3 };
    const decode = vi.fn(async () => bitmap);
    vi.stubGlobal("createImageBitmap", decode);
    const file = new Blob(["jpeg"], { type: "image/jpeg" });

    await expect(readImage(file)).resolves.toBe(bitmap);
    expect(decode).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
  });
});

type Call = [string, ...unknown[]];

function fakeCanvas(output: Blob | null) {
  const calls: Call[] = [];
  const context = {
    set fillStyle(value: string) {
      calls.push(["fillStyle", value]);
    },
    set imageSmoothingQuality(value: string) {
      calls.push(["imageSmoothingQuality", value]);
    },
    fillRect: (...args: unknown[]) => calls.push(["fillRect", ...args]),
    drawImage: (...args: unknown[]) => calls.push(["drawImage", ...args]),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (done: (blob: Blob | null) => void, type: string, quality: number) => {
      calls.push(["toBlob", type, quality]);
      done(output);
    },
  };
  vi.stubGlobal("document", { createElement: (tag: string) => (tag === "canvas" ? canvas : null) });
  return { calls, canvas };
}

describe("renderPicture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const bitmap = { width: 400, height: 100 } as unknown as ImageBitmap;

  it("paints the team colour behind the picture, then draws it where it was placed", async () => {
    const jpeg = new Blob(["x"], { type: "image/jpeg" });
    const { calls, canvas } = fakeCanvas(jpeg);

    await expect(renderPicture(bitmap, { scale: 0.25, x: 50, y: 87.5 }, 200, 512, "#A32D2D")).resolves.toBe(jpeg);

    expect([canvas.width, canvas.height]).toEqual([512, 512]);
    expect(calls).toEqual([
      ["fillStyle", "#A32D2D"],
      ["fillRect", 0, 0, 512, 512],
      ["imageSmoothingQuality", "high"],
      ["drawImage", bitmap, 128, 224, 256, 64],
      ["toBlob", "image/jpeg", JPEG_QUALITY],
    ]);
  });

  it("refuses a picture that is still too big", async () => {
    fakeCanvas(new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]));

    await expect(renderPicture(bitmap, { scale: 2, x: -300, y: 0 }, 200, 512, "#A32D2D")).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});
