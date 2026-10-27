"use client";

import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export function ShareLink({ url, text }: { url: string; text: string }) {
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("team.link.copied"));
    } catch {
      toast.error(t("team.link.copyFailed"));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p dir="ltr" className="truncate rounded-xl bg-muted px-3.5 py-3 font-mono text-sm select-all" data-testid="team-link">
        {url}
      </p>
      <div className="flex flex-col gap-2">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-success text-base font-bold text-white outline-none hover:bg-success/90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <MessageCircle className="size-5" aria-hidden />
          {t("share.whatsapp")}
        </a>
        <Button type="button" variant="outline" onClick={() => void copy()} className="h-12 rounded-xl text-base">
          <Copy className="size-5" aria-hidden />
          {t("team.link.copy")}
        </Button>
      </div>
    </div>
  );
}
