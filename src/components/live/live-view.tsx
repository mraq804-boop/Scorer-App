"use client";

import { useId, useMemo, useState } from "react";
import { Scoreboard } from "@/components/match/scoreboard";
import { ThisOver } from "@/components/match/this-over";
import { Scorecard } from "@/components/scorecard/scorecard";
import { ShareButtons } from "@/components/share/share-buttons";
import { t } from "@/lib/i18n";
import { formatCommentary, formatResult } from "@/lib/i18n/cricket";
import { useLiveEvents } from "@/lib/live/use-live-events";
import { currentInnings, replay } from "@/lib/scoring";
import type { InningsState, MatchEvent, MatchState } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import type { LiveMatchHeader } from "@/server/live";

type Tab = "live" | "scorecard";

type LiveViewProps = { match: LiveMatchHeader; initialEvents: MatchEvent[] };

const COMMENTARY_LINES = 12;

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "live", label: t("live.tab") },
  { id: "scorecard", label: t("scorecard.title") },
];

function Commentary({ state }: { state: MatchState }) {
  const lines = state.innings.flatMap((innings) => innings.commentary).slice(-COMMENTARY_LINES).reverse();
  if (lines.length === 0) return null;
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("live.commentary")}</h2>
      <ol data-testid="live-commentary" className="flex flex-col divide-y text-sm">
        {lines.map((item) => (
          <li key={item.eventId} className="py-2">
            <bdi>{formatCommentary(item, state.players)}</bdi>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LivePanel({ state, innings }: { state: MatchState; innings: InningsState | null }) {
  if (innings === null) {
    return <p className="rounded-2xl bg-muted p-4 text-center text-muted-foreground">{t("live.notStarted")}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <Scoreboard state={state} innings={innings} />
      {state.status === "innings_break" && (
        <p role="status" className="rounded-2xl bg-muted p-3 text-center font-semibold">
          {t("live.inningsBreak")}
        </p>
      )}
      {state.result !== null && (
        <p role="status" className="rounded-2xl bg-success-soft p-4 text-center text-lg font-bold">
          {formatResult(state.result, state.teams)}
        </p>
      )}
      <ThisOver innings={innings} ballsPerOver={state.rules.ballsPerOver} />
      <Commentary state={state} />
    </div>
  );
}

export function LiveView({ match, initialEvents }: LiveViewProps) {
  const events = useLiveEvents(match.id, match.code, initialEvents);
  const state = useMemo(() => replay(events), [events]);
  const innings = currentInnings(state) ?? state.innings.at(-1) ?? null;
  const [tab, setTab] = useState<Tab>("live");
  const id = useId();

  return (
    <div className="flex flex-1 flex-col gap-4 pb-4">
      <h1 className="flex min-h-12 min-w-0 items-center text-lg font-bold">
        <bdi className="block min-w-0 truncate">{match.title}</bdi>
      </h1>
      <div role="tablist" className="flex gap-1 rounded-xl bg-muted p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${id}-${item.id}-tab`}
            aria-selected={tab === item.id}
            aria-controls={`${id}-panel`}
            onClick={() => setTab(item.id)}
            className={cn(
              "h-11 flex-1 rounded-lg px-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
              tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}-tab`} className="flex min-w-0 flex-col">
        {tab === "live" ? <LivePanel state={state} innings={innings} /> : <Scorecard state={state} />}
      </div>
      <ShareButtons code={match.code} state={state} />
    </div>
  );
}
