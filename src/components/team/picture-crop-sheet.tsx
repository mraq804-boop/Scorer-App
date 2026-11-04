"use client";

import { LoaderCircle, Minus, Plus } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import { initialView, panBy, pinch, placement, scaleForLevel, zoomAt, zoomLevel } from "@/lib/media/crop";
import type { Point, Size, View } from "@/lib/media/crop";

export const CROP_FRAME = 240;
const STAGE = 272;
const INSET = (STAGE - CROP_FRAME) / 2;
const RADIUS = CROP_FRAME / 2;
const CENTRE = { x: RADIUS, y: RADIUS };
const KEY_STEP = 10;
const ZOOM_STEP = 0.1;
const WHEEL_SPEED = 0.0015;
const PREVIEW_SIZES = [72, 44];

const KEY_MOVES: Partial<Record<string, Point>> = {
  ArrowLeft: { x: -KEY_STEP, y: 0 },
  ArrowRight: { x: KEY_STEP, y: 0 },
  ArrowUp: { x: 0, y: -KEY_STEP },
  ArrowDown: { x: 0, y: KEY_STEP },
};
const KEY_ZOOMS: Partial<Record<string, number>> = { "+": ZOOM_STEP, "=": ZOOM_STEP, "-": -ZOOM_STEP };

function Placed({ src, image, view, size }: { src: string; image: Size; view: View; size: number }) {
  const at = placement(view, image, CROP_FRAME, size);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left select-none"
      style={{ width: image.width, height: image.height, transform: `translate(${at.x}px, ${at.y}px) scale(${at.width / image.width})` }}
    />
  );
}

type PictureCropSheetProps = {
  title: string;
  src: string;
  image: Size;
  fill: string;
  busy: boolean;
  onCancel: () => void;
  onUse: (view: View) => void;
};

export function PictureCropSheet({ title, src, image, fill, busy, onCancel, onUse }: PictureCropSheetProps) {
  const keysId = useId();
  const pointers = useRef(new Map<number, Point>());
  const [view, setView] = useState<View>(() => initialView(image, CROP_FRAME));

  const zoomBy = (step: number) =>
    setView((current) => zoomAt(current, scaleForLevel(zoomLevel(current, image, CROP_FRAME) + step, image, CROP_FRAME), CENTRE, image, CROP_FRAME));

  const stage = useCallback(
    (element: HTMLDivElement | null) => {
      if (element === null) return;
      const wheel = (event: WheelEvent) => {
        event.preventDefault();
        const box = element.getBoundingClientRect();
        const at = { x: event.clientX - box.left - INSET, y: event.clientY - box.top - INSET };
        setView((current) => zoomAt(current, current.scale * Math.exp(-event.deltaY * WHEEL_SPEED), at, image, CROP_FRAME));
      };
      element.addEventListener("wheel", wheel, { passive: false });
      return () => element.removeEventListener("wheel", wheel);
    },
    [image],
  );

  const toFrame = (event: PointerEvent<HTMLDivElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left - INSET, y: event.clientY - box.top - INSET };
  };

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, toFrame(event));
  };

  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (previous === undefined) return;
    const next = toFrame(event);
    const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1];
    pointers.current.set(event.pointerId, next);
    setView((current) =>
      other === undefined
        ? panBy(current, next.x - previous.x, next.y - previous.y, image, CROP_FRAME)
        : pinch(current, [previous, other], [next, other], image, CROP_FRAME),
    );
  };

  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
  };

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_MOVES[event.key];
    const zoom = KEY_ZOOMS[event.key];
    if (step !== undefined) setView((current) => panBy(current, step.x, step.y, image, CROP_FRAME));
    else if (zoom !== undefined) zoomBy(zoom);
    else return;
    event.preventDefault();
  };

  return (
    <Drawer open dismissible={false} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DrawerContent className="mx-auto max-w-md data-[vaul-drawer-direction=bottom]:max-h-[92dvh]">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{title}</DrawerTitle>
          <DrawerDescription>{t("brand.adjust.hint")}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col items-center gap-4 overflow-y-auto px-4">
          <div
            ref={stage}
            role="group"
            tabIndex={0}
            aria-label={t("brand.adjust.area")}
            aria-describedby={keysId}
            data-vaul-no-drag
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onKeyDown={keyDown}
            className="relative shrink-0 cursor-grab touch-none overflow-hidden rounded-2xl outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
            style={{ width: STAGE, height: STAGE, background: fill }}
          >
            <div className="absolute" style={{ left: INSET, top: INSET, width: CROP_FRAME, height: CROP_FRAME }}>
              <Placed src={src} image={image} view={view} size={CROP_FRAME} />
            </div>
            <svg aria-hidden className="pointer-events-none absolute inset-0" width={STAGE} height={STAGE}>
              <path
                fillRule="evenodd"
                fill="rgb(0 0 0 / 0.55)"
                d={`M0 0H${STAGE}V${STAGE}H0Z M${INSET} ${STAGE / 2}a${RADIUS} ${RADIUS} 0 1 0 ${CROP_FRAME} 0a${RADIUS} ${RADIUS} 0 1 0 ${-CROP_FRAME} 0Z`}
              />
              <circle cx={STAGE / 2} cy={STAGE / 2} r={RADIUS} fill="none" stroke="white" strokeWidth={2} />
            </svg>
            <p id={keysId} className="sr-only">
              {t("brand.adjust.keys")}
            </p>
          </div>
          <div className="flex w-full max-w-[272px] items-center gap-2" data-vaul-no-drag>
            <Button type="button" variant="ghost" size="icon-lg" aria-label={t("brand.adjust.zoomOut")} onClick={() => zoomBy(-ZOOM_STEP)}>
              <Minus className="size-5" aria-hidden />
            </Button>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(zoomLevel(view, image, CROP_FRAME) * 100)}
              aria-label={t("brand.adjust.zoom")}
              onChange={(event) =>
                setView((current) => zoomAt(current, scaleForLevel(Number(event.target.value) / 100, image, CROP_FRAME), CENTRE, image, CROP_FRAME))
              }
              className="h-11 min-w-0 flex-1 accent-primary"
            />
            <Button type="button" variant="ghost" size="icon-lg" aria-label={t("brand.adjust.zoomIn")} onClick={() => zoomBy(ZOOM_STEP)}>
              <Plus className="size-5" aria-hidden />
            </Button>
          </div>
          <div className="flex w-full max-w-[272px] items-center gap-3">
            {PREVIEW_SIZES.map((size) => (
              <span key={size} aria-hidden className="relative shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, background: fill }}>
                <Placed src={src} image={image} view={view} size={size} />
              </span>
            ))}
            <span className="text-sm text-muted-foreground">{t("brand.adjust.preview")}</span>
          </div>
        </div>
        <DrawerFooter className="flex-row pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel} className="h-12 flex-1 rounded-xl text-base font-semibold">
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={busy} onClick={() => onUse(view)} className="h-12 flex-1 rounded-xl text-base font-semibold">
            {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
            {t("brand.adjust.use")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
