"use client";

import { ImageDown, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { download, wasCancelled } from "@/lib/share/files";
import { cn } from "@/lib/utils";
import { createCardLoader } from "./card-loader";

type ShareImageLinkProps = { href: string; fileName: string; className?: string; children: ReactNode };

async function fetchImage(href: string, fileName: string): Promise<File | null> {
  try {
    const response = await fetch(href);
    if (!response.ok) return null;
    return new File([await response.blob()], fileName, { type: "image/png" });
  } catch {
    return null;
  }
}

export function ShareImageLink({ href, fileName, className, children }: ShareImageLinkProps) {
  const [busy, setBusy] = useState(false);
  const loader = useMemo(() => createCardLoader(() => fetchImage(href, fileName)), [href, fileName]);
  const warm = () => void loader.load(href);

  const share = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const file = loader.peek(href) ?? (await loader.load(href));
      if (file === null) {
        toast.error(t("share.imageFailed"));
        return;
      }
      if (!navigator.canShare?.({ files: [file] })) {
        download(file);
        return;
      }
      try {
        await navigator.share({ files: [file] });
      } catch (error) {
        if (!wasCancelled(error)) download(file);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={busy}
      onPointerDown={warm}
      onFocus={warm}
      onClick={(event) => void share(event)}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:opacity-60",
        className,
      )}
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImageDown className="size-4" aria-hidden />}
      {children}
    </a>
  );
}
