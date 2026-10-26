import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Scoreboard } from "@/components/match/scoreboard";
import { SyncChip } from "@/components/sync-chip";
import { t } from "@/lib/i18n";
import type { LocalMatch } from "@/lib/local/db";
import type { InningsState, MatchState } from "@/lib/scoring";

type ScoreHeaderProps = { local: LocalMatch; state: MatchState; innings: InningsState | null; actions?: ReactNode };

export function ScoreHeader({ local, state, innings, actions }: ScoreHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex min-h-12 items-center gap-2">
        <a
          href="/"
          aria-label={t("common.back")}
          className="-ms-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-6 rtl:rotate-180" aria-hidden />
        </a>
        <h1 className="min-w-16 flex-1 truncate text-lg font-bold">{state.title}</h1>
        <SyncChip match={local} className="shrink" />
        {actions}
      </div>
      {innings !== null && <Scoreboard state={state} innings={innings} />}
    </header>
  );
}
