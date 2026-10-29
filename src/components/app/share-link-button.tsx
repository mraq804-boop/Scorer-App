"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { wasCancelled } from "@/lib/share/files";

export function ShareLinkButton({ url, title }: { url: string; title: string }) {
  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title });
        return;
      } catch (error) {
        if (wasCancelled(error)) return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(t("app.linkCopied"));
    } catch {
      window.prompt(title, url);
    }
  };

  return (
    <button
      type="button"
      aria-label={t("app.share")}
      onClick={() => void share()}
      className="press grid size-11 place-items-center rounded-full outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-haldi/60"
    >
      <Share2 className="size-5" aria-hidden />
    </button>
  );
}
