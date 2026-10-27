import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { formatMatchDay, matchOutcome } from "@/lib/i18n/team";
import type { MatchOutcome } from "@/lib/i18n/team";
import type { TeamPageMatch } from "@/lib/team";
import { cn } from "@/lib/utils";

const PILLS: Record<MatchOutcome, { short: string; label: string; className: string }> = {
  won: { short: t("teamPage.pill.won"), label: t("teamPage.outcome.won"), className: "bg-success text-white" },
  lost: { short: t("teamPage.pill.lost"), label: t("teamPage.outcome.lost"), className: "bg-danger-soft text-destructive" },
  tied: { short: t("teamPage.pill.tied"), label: t("teamPage.outcome.tied"), className: "bg-muted text-foreground" },
  noResult: { short: t("teamPage.pill.noResult"), label: t("teamPage.outcome.noResult"), className: "bg-muted text-foreground" },
  live: { short: t("teamPage.pill.live"), label: t("teamPage.outcome.live"), className: "bg-haldi text-foreground" },
};

export function OutcomePill({ outcome }: { outcome: MatchOutcome }) {
  const pill = PILLS[outcome];
  return (
    <span className={cn("grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-2 text-xs font-bold", pill.className)}>
      <span aria-hidden>{pill.short}</span>
      <span className="sr-only">{pill.label}</span>
    </span>
  );
}

type MatchLinkProps = { match: TeamPageMatch; timeZone: string; children?: ReactNode };

export function MatchLink({ match, timeZone, children }: MatchLinkProps) {
  const opponent = match.record?.opponent;
  const line = match.status === "complete" ? match.result : (match.lines[0] ?? null);
  return (
    <a
      href={`/m/${match.code}`}
      className="flex items-start gap-3 rounded-2xl border bg-card p-3.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <OutcomePill outcome={matchOutcome(match)} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold">
          <bdi>{opponent === undefined ? match.title : t("team.fixtures.vs", { opponent })}</bdi>
        </span>
        {line !== null && line !== "" && (
          <span className="num truncate text-sm">
            <bdi>{line}</bdi>
          </span>
        )}
        {children}
        {match.record !== null && (
          <span className="num text-xs text-muted-foreground">{formatMatchDay(match.record.playedAt, timeZone)}</span>
        )}
      </span>
    </a>
  );
}
