"use client";

import { Undo2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { GuestSession } from "@/components/guest-session";
import { ThisOver } from "@/components/match/this-over";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { AllOutDialog } from "@/components/scoring/all-out-dialog";
import { findBall } from "@/components/scoring/ball-patch";
import { BatterSheet } from "@/components/scoring/batter-sheet";
import { BowlerSheet } from "@/components/scoring/bowler-sheet";
import { EditBallSheet } from "@/components/scoring/edit-ball-sheet";
import { ExtrasToggles, NO_EXTRAS } from "@/components/scoring/extras-toggles";
import { MatchMenu } from "@/components/scoring/match-menu";
import { RunPad } from "@/components/scoring/run-pad";
import { ScoreHeader } from "@/components/scoring/score-header";
import { StartInningsSheet } from "@/components/scoring/start-innings-sheet";
import { WicketSheet } from "@/components/scoring/wicket-sheet";
import { Button } from "@/components/ui/button";
import { useMatch } from "@/hooks/use-match";
import { t } from "@/lib/i18n";
import { formatResult, formatScoreLine } from "@/lib/i18n/cricket";
import { getLocalDb } from "@/lib/local/db";
import { recentPlayerNames } from "@/lib/local/matches";
import { currentInnings, deliveryDraft, undoTargets } from "@/lib/scoring";
import type { BallInput, MatchEvent } from "@/lib/scoring";
import { cn } from "@/lib/utils";

function inningsEndUndone(events: readonly MatchEvent[]): boolean {
  const at = events.findLastIndex((event) => event.type === "undo");
  const undo = events[at];
  if (undo?.type !== "undo") return false;
  const ends = new Set(events.filter((event) => event.type === "innings_ended").map((event) => event.id));
  return undo.targets.some((id) => ends.has(id)) && !events.slice(at + 1).some((event) => event.type === "delivery");
}

function useRecentNames(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    recentPlayerNames(getLocalDb())
      .then((recent) => {
        if (active) setNames(recent);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return names;
}

function Message({ matchId, children }: { matchId: string; children: ReactNode }) {
  return (
    <div data-match-id={matchId} className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      {children}
    </div>
  );
}

function MatchScreen({ matchId }: { matchId: string }) {
  const { local, events, state, prompt, record, loaded, busy, wroteLast } = useMatch(matchId);
  const recent = useRecentNames();
  const [extras, setExtras] = useState(NO_EXTRAS);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [autoEndFailedAt, setAutoEndFailedAt] = useState<string | null>(null);
  const autoEndedAt = useRef<string | null>(null);
  const latestUndo = useRef<() => void>(() => undefined);
  const targets = useMemo(() => undoTargets(events), [events]);

  const innings = state === null ? null : (currentInnings(state) ?? state.innings.at(-1) ?? null);
  const blocked = local?.syncState === "blocked";
  const lastEventId = events.at(-1)?.id ?? null;
  const inningsOver = !blocked && prompt?.kind === "innings_over" ? prompt : null;
  const autoEnd = inningsOver !== null && wroteLast && !inningsEndUndone(events) && autoEndFailedAt !== lastEventId;
  const scoring = !blocked && state?.status === "in_progress" && prompt === null;

  const undo = () => void record([{ type: "undo", targets }]);
  useEffect(() => {
    latestUndo.current = undo;
  });

  useEffect(() => {
    if (!autoEnd || inningsOver === null || state === null || innings === null) return;
    if (autoEndedAt.current === lastEventId) return;
    autoEndedAt.current = lastEventId;
    const line = formatScoreLine(innings, state);
    void record([{ type: "innings_ended", innings: innings.number, reason: inningsOver.reason }]).then((saved) => {
      if (!saved) {
        setAutoEndFailedAt(lastEventId);
        return;
      }
      toast(t("score.inningsOver"), {
        description: line,
        action: { label: t("score.undo"), onClick: () => latestUndo.current() },
      });
    });
  }, [autoEnd, state, innings, inningsOver, lastEventId, record]);

  if (!loaded) {
    return (
      <Message matchId={matchId}>
        <p className="text-muted-foreground">{t("score.loading")}</p>
      </Message>
    );
  }
  if (local === undefined || state === null) {
    return (
      <Message matchId={matchId}>
        <p className="font-semibold">{t("score.notFound")}</p>
        <Button asChild variant="outline" className="h-12 rounded-xl px-5">
          <a href="/">{t("score.backHome")}</a>
        </Button>
      </Message>
    );
  }

  const scoreBall = async (ball: Omit<BallInput, "kind" | "runsAs">) => {
    const saved = await record([deliveryDraft(state, { ...ball, kind: extras.kind, runsAs: extras.runsAs })]);
    if (saved) setExtras(NO_EXTRAS);
    return saved;
  };

  const sheetUndo = (
    <Button
      variant="ghost"
      disabled={busy || targets.length === 0}
      onClick={undo}
      className="h-12 rounded-xl text-base font-semibold"
    >
      <Undo2 aria-hidden />
      {t("score.undo")}
    </Button>
  );
  const prompted = !blocked && innings !== null && state.status === "in_progress" ? prompt?.kind : undefined;
  const editing = blocked || editingId === null ? null : findBall(events, state, editingId);
  const sheet = { state, recent, busy, undo: sheetUndo, onRecord: record };

  return (
    <div data-match-id={matchId} className="flex flex-1 flex-col gap-4 pb-4">
      <ScoreHeader
        local={local}
        state={state}
        innings={innings}
        actions={
          <MatchMenu
            state={state}
            blocked={blocked}
            busy={busy}
            recent={recent}
            onRecord={record}
            onEditBall={setEditingId}
          />
        }
      />
      {blocked && (
        <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-destructive">
          {t("sync.blocked")}
        </p>
      )}
      {innings !== null && (
        <ThisOver innings={innings} ballsPerOver={state.rules.ballsPerOver} onSelect={blocked ? undefined : setEditingId} />
      )}

      <div className="mt-auto flex flex-col gap-3">
        {state.result !== null && (
          <p role="status" className="rounded-2xl bg-success-soft p-4 text-center text-lg font-bold">
            {formatResult(state.result, state.teams)}
          </p>
        )}
        {inningsOver !== null && innings !== null && !autoEnd && (
          <Button
            disabled={busy}
            onClick={() => void record([{ type: "innings_ended", innings: innings.number, reason: inningsOver.reason }])}
            className="h-14 rounded-2xl text-base font-bold disabled:opacity-100"
          >
            {t("score.endInnings")}
          </Button>
        )}
        {state.status !== "complete" && (
          <>
            <ExtrasToggles value={extras} disabled={!scoring || busy} dimmed={!scoring} onChange={setExtras} />
            <RunPad
              disabled={!scoring || busy}
              dimmed={!scoring}
              onRuns={(runs, boundary) => void scoreBall({ runs, boundary })}
            />
          </>
        )}
        <div className="flex gap-2">
          {state.status !== "complete" && (
            <Button
              data-testid="wicket"
              disabled={!scoring || busy}
              onClick={() => setWicketOpen(true)}
              className={cn(
                "h-16 flex-1 rounded-2xl bg-destructive text-xl font-extrabold text-white hover:bg-destructive/90",
                scoring ? "disabled:opacity-100" : "disabled:opacity-40",
              )}
            >
              {t("score.wicket")}
            </Button>
          )}
          <Button
            data-testid="undo"
            variant="outline"
            disabled={blocked || busy || targets.length === 0}
            onClick={undo}
            className={cn(
              "h-16 flex-1 rounded-2xl border-2 text-base font-bold",
              state.status !== "complete" && "max-w-32",
              !blocked && targets.length > 0 ? "disabled:opacity-100" : "disabled:opacity-40",
            )}
          >
            <Undo2 className="size-5" aria-hidden />
            {t("score.undo")}
          </Button>
        </div>
      </div>

      {prompted === "choose_batter" && innings !== null && <BatterSheet innings={innings} {...sheet} />}
      {prompted === "choose_bowler" && innings !== null && <BowlerSheet innings={innings} {...sheet} />}
      {prompted === "all_out" && innings !== null && <AllOutDialog innings={innings} {...sheet} />}
      {!blocked && prompt?.kind === "start_innings" && <StartInningsSheet innings={prompt.innings} {...sheet} />}
      {editing !== null && (
        <EditBallSheet
          state={state}
          ball={editing}
          busy={busy}
          onClose={() => setEditingId(null)}
          onSave={(patch) => record([{ type: "correct", target: editing.event.id, patch }])}
        />
      )}
      {wicketOpen && scoring && innings !== null && (
        <WicketSheet
          state={state}
          innings={innings}
          kind={extras.kind}
          busy={busy}
          onClose={() => setWicketOpen(false)}
          onBall={scoreBall}
          onRetire={(player, how) => record([{ type: "retired", player, how }])}
        />
      )}
    </div>
  );
}

function ScoreScreen() {
  const matchId = useSearchParams().get("m") ?? "";
  return <MatchScreen key={matchId} matchId={matchId} />;
}

export default function ScorePage() {
  return (
    <main data-testid="score-shell" className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-2 pb-safe">
      <Suspense fallback={<p className="m-auto text-muted-foreground">{t("score.loading")}</p>}>
        <ScoreScreen />
      </Suspense>
      <GuestSession />
      <PwaRegister />
    </main>
  );
}
