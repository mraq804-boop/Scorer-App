"use client";

import { MessageCircle } from "lucide-react";
import type { MouseEvent } from "react";
import { t } from "@/lib/i18n";

function wasCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function ShareTeam({ text }: { text: string }) {
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

  const share = (event: MouseEvent<HTMLAnchorElement>) => {
    if (typeof navigator.share !== "function") return;
    event.preventDefault();
    navigator.share({ text }).catch((error: unknown) => {
      if (!wasCancelled(error)) window.open(whatsappUrl, "_blank", "noopener");
    });
  };

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={share}
      className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-success text-base font-bold text-white outline-none hover:bg-success/90 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <MessageCircle className="size-5" aria-hidden />
      {t("share.whatsapp")}
    </a>
  );
}
