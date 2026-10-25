"use client";

import { RotateCcw } from "lucide-react";
import { t } from "@/lib/i18n";

export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground"
    >
      <RotateCcw className="size-4" aria-hidden />
      {t("offline.retry")}
    </button>
  );
}
