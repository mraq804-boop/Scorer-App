export const MAX_ZOOM = 4;

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type View = { scale: number; x: number; y: number };

export function zoomRange(image: Size, frame: number): { min: number; max: number } {
  const cover = Math.max(frame / image.width, frame / image.height);
  return { min: frame / Math.hypot(image.width, image.height), max: cover * MAX_ZOOM };
}

function clampAxis(position: number, length: number, frame: number): number {
  const [low, high] = length >= frame ? [frame - length, 0] : [0, frame - length];
  return Math.min(high, Math.max(low, position));
}

export function clampView(view: View, image: Size, frame: number): View {
  const { min, max } = zoomRange(image, frame);
  const scale = Math.min(max, Math.max(min, view.scale));
  return {
    scale,
    x: clampAxis(view.x, image.width * scale, frame),
    y: clampAxis(view.y, image.height * scale, frame),
  };
}

export function initialView(image: Size, frame: number): View {
  const scale = Math.max(frame / image.width, frame / image.height);
  return { scale, x: (frame - image.width * scale) / 2, y: (frame - image.height * scale) / 2 };
}

function move(view: View, scale: number, from: Point, to: Point, image: Size, frame: number): View {
  const { min, max } = zoomRange(image, frame);
  const next = Math.min(max, Math.max(min, scale));
  const ratio = next / view.scale;
  return clampView({ scale: next, x: to.x - (from.x - view.x) * ratio, y: to.y - (from.y - view.y) * ratio }, image, frame);
}

export function zoomAt(view: View, scale: number, at: Point, image: Size, frame: number): View {
  return move(view, scale, at, at, image, frame);
}

export function panBy(view: View, dx: number, dy: number, image: Size, frame: number): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, image, frame);
}

function midpoint([a, b]: readonly [Point, Point]): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function spread([a, b]: readonly [Point, Point]): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pinch(view: View, from: readonly [Point, Point], to: readonly [Point, Point], image: Size, frame: number): View {
  const before = spread(from);
  if (before === 0) return clampView(view, image, frame);
  return move(view, (view.scale * spread(to)) / before, midpoint(from), midpoint(to), image, frame);
}

export function zoomLevel(view: View, image: Size, frame: number): number {
  const { min, max } = zoomRange(image, frame);
  return Math.min(1, Math.max(0, Math.log(view.scale / min) / Math.log(max / min)));
}

export function scaleForLevel(level: number, image: Size, frame: number): number {
  const { min, max } = zoomRange(image, frame);
  return min * Math.pow(max / min, Math.min(1, Math.max(0, level)));
}

export function placement(view: View, image: Size, frame: number, size: number): { x: number; y: number; width: number; height: number } {
  return {
    x: (view.x * size) / frame,
    y: (view.y * size) / frame,
    width: (image.width * view.scale * size) / frame,
    height: (image.height * view.scale * size) / frame,
  };
}
