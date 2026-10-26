"use client";

import { useId, useMemo, useState } from "react";
import { Scorecard } from "@/components/scorecard/scorecard";
import { t } from "@/lib/i18n";
import { formatCommentary, formatFigures, formatNeed, formatResult } from "@/lib/i18n/cricket";
import { useLiveEvents } from "@/lib/live/use-live-events";
import { currentInnings, formatOvers, replay, requiredRunRate, runRate } from "@/lib/scoring";
import type { BatterLine, BowlerLine, CommentaryItem, InningsState, MatchEvent, MatchState } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import type { LiveMatchHeader } from "@/server/live";

type Tab = "live" | "scorecard";

type LiveViewProps = { match: LiveMatchHeader; initialEvents: MatchEvent[] };

const COMMENTARY_LINES = 12;

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "live", label: t("live.tab") },
  { id: "scorecard", label: t("scorecard.title") },
];

const CHIP_TONES = {
  wicket: "bg-destructive text-white",
  boundary: "bg-primary text-primary-foreground",
  extra: "bg-accent text-accent-foreground",
  plain: "bg-muted text-foreground",
} as const;

function playerName(state: MatchState, id: string): string {
  return state.players[id]?.name ?? id;
}

function chase(state: MatchState, innings: InningsState): { needed: number; ballsLeft: number } | null {
  if (innings.number !== 2 || innings.ended !== null || state.target === null) return null;
  const needed = state.target - innings.runs;
  const ballsLeft = state.rules.oversPerInnings * state.rules.ballsPerOver - innings.legalBalls;
  return needed > 0 && ballsLeft > 0 ? { needed, ballsLeft } : null;
}

function chipTone(item: CommentaryItem | undefined): keyof typeof CHIP_TONES {
  if (item === undefined) return "plain";
  if (item.wicket !== null) return "wicket";
  if (item.kind !== "legal" || (item.runsAs !== "bat" && item.runs > 0)) return "extra";
  if (item.boundary && (item.runs === 4 || item.runs === 6)) return "boundary";
  return "plain";
}

function BatterRow({ state, line, striker }: { state: MatchState; line: BatterLine; striker: boolean }) {
  return (
    <li className={cn("flex items-baseline justify-between gap-3", !striker && "opacity-80")}>
      <span className={cn("flex min-w-0 items-baseline gap-0.5", striker && "font-bold")}>
        <bdi className="min-w-0 truncate">{playerName(state, line.playerId)}</bdi>
        {striker && (
          <>
            <span aria-hidden>*</span>
            <span className="sr-only">{t("score.onStrike")}</span>
          </>
        )}
      </span>
      <span className="num shrink-0 font-semibold">{t("score.batter", { runs: line.runs, balls: line.balls })}</span>
    </li>
  );
}

function BowlerRow({ state, playerId, line }: { state: MatchState; playerId: string; line: BowlerLine | undefined }) {
  const figures = line ?? { playerId, legalBalls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, maidens: 0, dots: 0 };
  return (
    <p className="flex items-baseline justify-between gap-3">
      <bdi className="min-w-0 truncate">{playerName(state, playerId)}</bdi>
      <span className="num shrink-0 font-semibold">{formatFigures(figures, state.rules.ballsPerOver)}</span>
    </p>
  );
}

function Scoreboard({ state, innings }: { state: MatchState; innings: InningsState }) {
  const bpo = state.rules.ballsPerOver;
  const inPlay = innings.ended === null;
  const target = chase(state, innings);
  const atCrease = inPlay
    ? innings.batting.filter((line) => line.playerId === innings.striker || line.playerId === innings.nonStriker)
    : [];
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-primary p-4 text-primary-foreground">
      <div className="flex items-center justify-between gap-3">
        <bdi className="min-w-0 truncate text-sm font-semibold opacity-80">{state.teams[innings.battingTeam].name}</bdi>
        {inPlay && innings.freeHit && (
          <span className="shrink-0 rounded-full bg-haldi px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-black">
            {t("score.freeHit")}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p data-testid="live-score" className="num flex items-baseline gap-2 leading-none font-extrabold">
          <span className="text-5xl">{t("score.runsWickets", { runs: innings.runs, wickets: innings.wickets })}</span>{" "}
          <span className="text-2xl opacity-80">{t("score.overs", { overs: formatOvers(innings.legalBalls, bpo) })}</span>
        </p>
        <div className="num flex shrink-0 flex-col items-end text-sm font-semibold">
          <span>{t("score.crr", { rate: runRate(innings.runs, innings.legalBalls, bpo).toFixed(2) })}</span>
          {target !== null && (
            <span>{t("score.rrr", { rate: (requiredRunRate(target.needed, target.ballsLeft, bpo) ?? 0).toFixed(2) })}</span>
          )}
        </div>
      </div>
      {target !== null && <p className="text-base font-bold text-haldi">{formatNeed(target.needed, target.ballsLeft)}</p>}
      {(atCrease.length > 0 || (inPlay && innings.bowler !== null)) && (
        <div className="flex flex-col gap-1.5 border-t border-primary-foreground/20 pt-3 text-base">
          <ul className="flex flex-col gap-1">
            {atCrease.map((line) => (
              <BatterRow key={line.playerId} state={state} line={line} striker={line.playerId === innings.striker} />
            ))}
          </ul>
          {inPlay && innings.bowler !== null && (
            <BowlerRow
              state={state}
              playerId={innings.bowler}
              line={innings.bowling.find((line) => line.playerId === innings.bowler)}
            />
          )}
        </div>
      )}
    </section>
  );
}

function ThisOver({ state, innings }: { state: MatchState; innings: InningsState }) {
  const over = innings.overs.at(-1);
  const finished = over !== undefined && over.index < Math.floor(innings.legalBalls / state.rules.ballsPerOver);
  const items = new Map(innings.commentary.map((item) => [item.eventId, item]));
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {finished ? t("score.lastOver") : t("score.thisOver")}
      </h2>
      <ol data-testid="live-this-over" className="flex min-h-10 flex-wrap gap-1.5">
        {(over?.balls ?? []).map((chip) => (
          <li
            key={chip.eventId}
            className={cn(
              "num grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm font-bold",
              CHIP_TONES[chipTone(items.get(chip.eventId))],
            )}
          >
            {chip.label}
          </li>
        ))}
      </ol>
    </section>
  );
}

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
      <ThisOver state={state} innings={innings} />
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
    </div>
  );
}
