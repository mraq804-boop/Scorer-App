import { t } from "@/lib/i18n";
import type { LocalMatch } from "@/lib/local/db";
import { cn } from "@/lib/utils";

type SyncChipProps = { match: Pick<LocalMatch, "syncState" | "syncedSeq" | "lastSeq" | "blockedReason">; className?: string };

export function blockedMessage(reason: LocalMatch["blockedReason"]): string {
  return reason === "not_owner" ? t("sync.notOwner") : t("sync.blocked");
}

function chip(match: SyncChipProps["match"]) {
  if (match.syncState === "blocked") {
    return { label: blockedMessage(match.blockedReason), tone: "bg-danger-soft text-destructive", dot: "bg-destructive" };
  }
  if (match.syncedSeq < match.lastSeq) return { label: t("sync.saved"), tone: "bg-muted", dot: "bg-haldi" };
  return { label: t("sync.synced"), tone: "bg-muted", dot: "bg-success" };
}

export function SyncChip({ match, className }: SyncChipProps) {
  const { label, tone, dot } = chip(match);
  return (
    <span
      data-testid="sync-chip"
      className={cn("inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tone, className)}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot)} />
      <span className="truncate">{label}</span>
    </span>
  );
}
