"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { t } from "@/lib/i18n";
import { ImageTooLargeError, prepareImage } from "@/lib/media/prepare-image";
import { cn } from "@/lib/utils";

type PictureInputProps = {
  label: string;
  size: number;
  onPicked: (blob: Blob) => Promise<void>;
  onError: (message: string) => void;
  className?: string;
  children: ReactNode;
};

export function PictureInput({ label, size, onPicked, onError, className, children }: PictureInputProps) {
  const [busy, setBusy] = useState(false);

  const change = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined || busy) return;
    setBusy(true);
    try {
      await onPicked(await prepareImage(file, size));
    } catch (error) {
      onError(t(error instanceof ImageTooLargeError ? "brand.error.tooLarge" : "brand.error.unreadable"));
    } finally {
      setBusy(false);
    }
  };

  return (
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
  );
}
