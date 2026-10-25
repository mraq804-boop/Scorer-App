import { TriangleAlert } from "lucide-react";
import { t } from "@/lib/i18n";

export function StorageError({ reason = "unavailable" }: { reason?: "unavailable" | "quota" }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl bg-danger-soft p-4">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
      <p className="min-w-0 text-sm leading-relaxed">{reason === "quota" ? t("storage.full") : t("storage.unavailable")}</p>
    </div>
  );
}
