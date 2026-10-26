"use client";

import { ImageDown, LoaderCircle, MessageCircle } from "lucide-react";
import { useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import type { MatchState } from "@/lib/scoring";
import { buildShareText } from "@/lib/share/text";
import { matchUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

type ShareButtonsProps = { code: string; state: MatchState; beforeShare?: () => Promise<void> };

type Busy = "text" | "image" | null;

const REVOKE_DELAY_MS = 1000;
const BUTTON =
  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 aria-disabled:opacity-60";

function wasCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function download(file: File): void {
  const href = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = href;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), REVOKE_DELAY_MS);
}

async function fetchCard(code: string): Promise<File | null> {
  try {
    const response = await fetch(`/m/${code}/card`, { cache: "no-store" });
    if (!response.ok) return null;
    return new File([await response.blob()], `scorecard-${code}.png`, { type: "image/png" });
  } catch {
    return null;
  }
}

export function ShareButtons({ code, state, beforeShare }: ShareButtonsProps) {
  const [busy, setBusy] = useState<Busy>(null);
  const text = buildShareText(state, matchUrl(code));
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await beforeShare?.();
      await action();
    } finally {
      setBusy(null);
    }
  };

  const shareText = (event: MouseEvent<HTMLAnchorElement>) => {
    const native = typeof navigator.share === "function";
    if (busy === null && !native && beforeShare === undefined) return;
    event.preventDefault();
    if (busy !== null) return;
    void run("text", async () => {
      if (native) {
        try {
          await navigator.share({ text });
          return;
        } catch (error) {
          if (wasCancelled(error)) return;
        }
      }
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    });
  };

  const shareImage = () =>
    run("image", async () => {
      const file = await fetchCard(code);
      if (file === null) {
        toast.error(t("share.imageFailed"));
        return;
      }
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (error) {
          if (wasCancelled(error)) return;
        }
      }
      download(file);
    });

  return (
    <div className="flex flex-col gap-3">
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={busy !== null}
        data-testid="share-whatsapp"
        onClick={shareText}
        className={cn(BUTTON, "bg-success text-white hover:bg-success/90")}
      >
        {busy === "text" ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <MessageCircle className="size-5" aria-hidden />}
        {t("share.whatsapp")}
      </a>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void shareImage()}
        data-testid="share-image"
        className={cn(BUTTON, "border-2 border-border bg-background hover:bg-muted")}
      >
        {busy === "image" ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <ImageDown className="size-5" aria-hidden />}
        {t("share.image")}
      </button>
    </div>
  );
}
