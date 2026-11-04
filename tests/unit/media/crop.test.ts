import { describe, expect, it } from "vitest";
import { MAX_ZOOM, clampView, initialView, panBy, pinch, placement, scaleForLevel, zoomAt, zoomLevel, zoomRange } from "@/lib/media/crop";
import type { View } from "@/lib/media/crop";

const FRAME = 200;
const WIDE = { width: 400, height: 100 };
const SQUARE = { width: 50, height: 50 };

function corners(view: View, image: { width: number; height: number }) {
  return [
    { x: view.x, y: view.y },
    { x: view.x + image.width * view.scale, y: view.y },
    { x: view.x, y: view.y + image.height * view.scale },
    { x: view.x + image.width * view.scale, y: view.y + image.height * view.scale },
  ];
}

describe("zoomRange", () => {
  it("zooms out until the whole picture fits inside the circle and in to four times filling it", () => {
    const { min, max } = zoomRange(WIDE, FRAME);
    expect(min).toBeCloseTo(FRAME / Math.hypot(400, 100));
    expect(max).toBeCloseTo((FRAME / 100) * MAX_ZOOM);
    expect(MAX_ZOOM).toBe(4);
  });
});

describe("initialView", () => {
  it("fills the circle and centres a wide picture, like the old square crop", () => {
    expect(initialView(WIDE, FRAME)).toEqual({ scale: 2, x: -300, y: 0 });
  });

  it("fills the circle with a square picture", () => {
    expect(initialView(SQUARE, FRAME)).toEqual({ scale: 4, x: 0, y: 0 });
  });
});

describe("clampView", () => {
  it("keeps a zoomed-in picture covering the whole frame", () => {
    expect(clampView({ scale: 2, x: 50, y: -40 }, WIDE, FRAME)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(clampView({ scale: 2, x: -900, y: 30 }, WIDE, FRAME)).toEqual({ scale: 2, x: -600, y: 0 });
  });

  it("keeps a zoomed-out picture inside the frame", () => {
    const { min } = zoomRange(WIDE, FRAME);
    const view = clampView({ scale: min, x: -50, y: 500 }, WIDE, FRAME);
    expect(view.x).toBeCloseTo(0);
    expect(view.y).toBeCloseTo(FRAME - 100 * min);
  });

  it("never zooms past the range", () => {
    const { min, max } = zoomRange(WIDE, FRAME);
    expect(clampView({ scale: 0.01, x: 0, y: 0 }, WIDE, FRAME).scale).toBeCloseTo(min);
    expect(clampView({ scale: 99, x: 0, y: 0 }, WIDE, FRAME).scale).toBeCloseTo(max);
  });
});

describe("zoomAt", () => {
  it("keeps the point under the finger still", () => {
    const start = initialView(WIDE, FRAME);
    const at = { x: 120, y: 80 };
    const before = { x: (at.x - start.x) / start.scale, y: (at.y - start.y) / start.scale };
    const next = zoomAt(start, 3, at, WIDE, FRAME);
    expect(next.scale).toBe(3);
    expect((at.x - next.x) / next.scale).toBeCloseTo(before.x);
    expect((at.y - next.y) / next.scale).toBeCloseTo(before.y);
  });

  it("fits the whole picture inside the circle when zoomed all the way out", () => {
    const next = zoomAt(initialView(WIDE, FRAME), 0, { x: 100, y: 100 }, WIDE, FRAME);
    for (const corner of corners(next, WIDE)) {
      expect(Math.hypot(corner.x - FRAME / 2, corner.y - FRAME / 2)).toBeLessThanOrEqual(FRAME / 2 + 1e-9);
    }
  });
});

describe("panBy", () => {
  it("moves the picture with the finger", () => {
    expect(panBy(initialView(WIDE, FRAME), 40, 0, WIDE, FRAME)).toEqual({ scale: 2, x: -260, y: 0 });
  });

  it("stops at the edge of the picture", () => {
    expect(panBy(initialView(WIDE, FRAME), 1000, 30, WIDE, FRAME)).toEqual({ scale: 2, x: 0, y: 0 });
  });
});

describe("pinch", () => {
  it("zooms by how far the fingers spread and follows their midpoint", () => {
    const start = initialView(WIDE, FRAME);
    const next = pinch(
      start,
      [
        { x: 80, y: 100 },
        { x: 120, y: 100 },
      ],
      [
        { x: 70, y: 100 },
        { x: 150, y: 100 },
      ],
      WIDE,
      FRAME,
    );
    expect(next.scale).toBeCloseTo(4);
    expect((110 - next.x) / next.scale).toBeCloseTo((100 - start.x) / start.scale);
  });

  it("ignores fingers on the same spot", () => {
    const start = initialView(WIDE, FRAME);
    const same = { x: 100, y: 100 };
    expect(pinch(start, [same, same], [same, same], WIDE, FRAME)).toEqual(start);
  });
});

describe("zoom level", () => {
  it("runs from 0 at fully out to 1 at fully in", () => {
    const { min, max } = zoomRange(WIDE, FRAME);
    expect(scaleForLevel(0, WIDE, FRAME)).toBeCloseTo(min);
    expect(scaleForLevel(1, WIDE, FRAME)).toBeCloseTo(max);
    expect(zoomLevel({ scale: min, x: 0, y: 0 }, WIDE, FRAME)).toBeCloseTo(0);
    expect(zoomLevel({ scale: max, x: 0, y: 0 }, WIDE, FRAME)).toBeCloseTo(1);
  });

  it("round-trips a level", () => {
    const scale = scaleForLevel(0.37, WIDE, FRAME);
    expect(zoomLevel({ scale, x: 0, y: 0 }, WIDE, FRAME)).toBeCloseTo(0.37);
  });
});

describe("placement", () => {
  it("scales the view from the frame to the saved picture", () => {
    expect(placement({ scale: 2, x: -300, y: 10 }, WIDE, FRAME, 512)).toEqual({ x: -768, y: 25.6, width: 2048, height: 512 });
  });
});
