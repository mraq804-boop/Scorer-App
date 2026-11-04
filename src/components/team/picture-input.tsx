"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { t } from "@/lib/i18n";
import type { Size, View } from "@/lib/media/crop";
import { ImageTooLargeError, readImage, renderPicture } from "@/lib/media/prepare-image";
import { cn } from "@/lib/utils";
import { CROP_FRAME, PictureCropSheet } from "./picture-crop-sheet";

type PictureInputProps = {
  label: string;
  title: string;
  size: number;
  fill: string;
  onPicked: (blob: Blob) => Promise<void>;
  onError: (message: string) => void;
  className?: string;
  children: ReactNode;
};

type Picked = { bitmap: ImageBitmap; url: string; size: Size };

function release(picked: Picked | null) {
  if (picked === null) return;
  picked.bitmap.close();
  URL.revokeObjectURL(picked.url);
}

export function PictureInput({ label, title, size, fill, onPicked, onError, className, children }: PictureInputProps) {
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const open = useRef<Picked | null>(null);

  useEffect(() => () => release(open.current), []);

  const close = () => {
    release(open.current);
    open.current = null;
    setPicked(null);
  };

  const change = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined || busy) return;
    setBusy(true);
    try {
      const bitmap = await readImage(file);
      const next = { bitmap, url: URL.createObjectURL(file), size: { width: bitmap.width, height: bitmap.height } };
      open.current = next;
      setPicked(next);
    } catch {
      onError(t("brand.error.unreadable"));
    } finally {
      setBusy(false);
    }
  };

  const use = async (view: View) => {
    if (picked === null || busy) return;
    setBusy(true);
    try {
      await onPicked(await renderPicture(picked.bitmap, view, CROP_FRAME, size, fill));
    } catch (error) {
      onError(t(error instanceof ImageTooLargeError ? "brand.error.tooLarge" : "brand.error.unreadable"));
    } finally {
      setBusy(false);
      close();
    }
  };

  return (
    <>
      <label
        className={cn(
          "relative inline-flex cursor-pointer items-center justify-center gap-2 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
          busy && "pointer-events-none opacity-60",
          className,
        )}
      >
        <input
          type="file"
          accept="image/*"
          aria-label={label}
          disabled={busy}
          onChange={(event) => void change(event)}
          className="sr-only"
        />
        {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : children}
      </label>
      {picked !== null && (
        <PictureCropSheet
          title={title}
          src={picked.url}
          image={picked.size}
          fill={fill}
          busy={busy}
          onCancel={close}
          onUse={(view) => void use(view)}
        />
      )}
    </>
  );
}
