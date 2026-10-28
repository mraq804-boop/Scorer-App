import { afterEach, describe, expect, it, vi } from "vitest";
import { LOGO_SIZE, MAX_UPLOAD_BYTES, PHOTO_SIZE, prepareImage, squareCrop } from "@/lib/media/prepare-image";

describe("squareCrop", () => {
  it("takes the centre square of a wide picture", () => {
    expect(squareCrop(800, 600)).toEqual({ sx: 100, sy: 0, side: 600 });
  });

  it("takes the centre square of a tall picture", () => {
    expect(squareCrop(600, 900)).toEqual({ sx: 0, sy: 150, side: 600 });
  });

  it("keeps a square picture whole", () => {
    expect(squareCrop(500, 500)).toEqual({ sx: 0, sy: 0, side: 500 });
  });

  it("uses the agreed sizes", () => {
    expect([LOGO_SIZE, PHOTO_SIZE, MAX_UPLOAD_BYTES]).toEqual([512, 384, 307200]);
  });
});

describe("prepareImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads a phone photo the right way up", async () => {
    const decode = vi.fn(async () => {
      throw new Error("stop after decode");
    });
    vi.stubGlobal("createImageBitmap", decode);
    const file = new Blob(["jpeg"], { type: "image/jpeg" });

    await expect(prepareImage(file, PHOTO_SIZE)).rejects.toThrow("stop after decode");
    expect(decode).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
  });
});
