"use client";

import { useMemo } from "react";
import { Crowd } from "@/components/art/cricket-art";
import { Confetti } from "@/components/effects/confetti";
import { Avatar } from "@/components/team-page/avatar";
import { colourFor, logoUrl, photoUrl } from "@/lib/brand";
import type { TeamColour } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { formatResult } from "@/lib/i18n/cricket";
import { currentInnings, formatOvers, playerName } from "@/lib/scoring";
import type { MatchState, TeamSide } from "@/lib/scoring";
import { posterOutcome } from "@/lib/team/posters";
import type { PosterOutcome } from "@/lib/team/posters";
import type { LiveTeam } from "@/server/live";
import { BallBurst } from "./ball-burst";

const SIDES: readonly TeamSide[] = ["A", "B"];
const GOLD = "#e2a322";

export function outcomeText(state: MatchState, outcome: PosterOutcome): string | null {
  switch (outcome.kind) {
    case "won":
      return state.result === null ? null : formatResult(state.result, state.teams);
    case "tie":
      return t("poster.tied");
    case "noResult":
      return t("poster.noResult");
    case "live":
      return null;
  }
}

function sideColour(state: MatchState, side: TeamSide, team: LiveTeam | null): TeamColour {
  return colourFor(team?.side === side ? team.colour : null, state.teams[side].name);
}

function TeamPanel({ state, side, team }: { state: MatchState; side: TeamSide; team: LiveTeam | null }) {
  const name = state.teams[side].name;
  const colour = sideColour(state, side, team);
  const innings = state.innings.find((candidate) => candidate.battingTeam === side);
  const logo = team !== null && team.side === side ? logoUrl(team.code, team.logoVersion) : null;
  return (
    <div
      className="relative flex min-w-0 flex-col items-center gap-1.5 px-3 pt-4 pb-5 text-center"
      style={{ background: colour.base, color: colour.on }}
    >
      <Avatar
        name={name}
        url={logo}
        size={52}
        colour={colour}
        alt={t("brand.logoAlt", { name })}
        className="ring-3 ring-haldi"
      />
      <bdi className="block w-full truncate text-sm font-bold">{name}</bdi>
      {innings === undefined ? (
        <p className="text-sm font-semibold opacity-90">{t("poster.yetToBat")}</p>
      ) : (
        <p className="num flex items-baseline gap-1 leading-none font-extrabold">
          <span className="text-3xl">{t("score.runsWickets", { runs: innings.runs, wickets: innings.wickets })}</span>
          <span className="text-sm opacity-90">
            {t("score.overs", { overs: formatOvers(innings.legalBalls, state.rules.ballsPerOver) })}
          </span>
        </p>
      )}
    </div>
  );
}

function Crease({ state, team }: { state: MatchState; team: LiveTeam | null }) {
  const innings = currentInnings(state);
  if (innings === null) return null;
  const colour = sideColour(state, innings.battingTeam, team);
  const ours = team !== null && team.side === innings.battingTeam;
  const ids = [innings.striker, innings.nonStriker].filter((id): id is string => id !== null);
  if (ids.length === 0) return null;
  return (
    <ul data-testid="crease" className="relative grid grid-cols-2 gap-3 px-4 py-3">
      {ids.map((id) => {
        const line = innings.batting.find((candidate) => candidate.playerId === id);
        const name = playerName(state.players, id);
        return (
          <li key={id} className="flex min-w-0 items-center gap-2">
            <Avatar
              name={name}
              url={ours ? photoUrl(team.code, id, team.photos[id]) : null}
              size={40}
              colour={colour}
              alt={name}
              className={id === innings.striker ? "ring-2 ring-haldi" : undefined}
            />
            <span className="flex min-w-0 flex-col leading-tight">
              <bdi className="truncate text-sm font-semibold">{name}</bdi>
              <span className="num text-xs opacity-80">
                {t("score.batter", { runs: line?.runs ?? 0, balls: line?.balls ?? 0 })}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Status({ state, outcome }: { state: MatchState; outcome: PosterOutcome }) {
  const text = outcomeText(state, outcome);
  if (text !== null) {
    return (
      <p role="status" className="min-w-0 text-sm font-extrabold text-haldi">
        <bdi>{text}</bdi>
      </p>
    );
  }
  if (state.status === "innings_break") {
    return <p className="shrink-0 text-sm font-bold text-haldi">{t("live.inningsBreak")}</p>;
  }
  if (state.innings.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-white">
      <span aria-hidden className="size-2 animate-pulse rounded-full bg-white" />
      {t("share.liveBadge")}
    </span>
  );
}

type LiveHeroProps = { state: MatchState; team: LiveTeam | null; title?: string };

export function LiveHero({ state, team, title = state.title }: LiveHeroProps) {
  const outcome = posterOutcome(state, team?.resultOverride ?? null);
  const winner = outcome.kind === "won" && (team === null || team.side === outcome.winner) ? outcome.winner : null;
  const winnerBase = winner === null ? null : sideColour(state, winner, team).light;
  const confetti = useMemo(
    () => (winnerBase === null ? null : [GOLD, winnerBase, "#D4537E", "#5DCAA5"]),
    [winnerBase],
  );
  const commentary = useMemo(() => state.innings.flatMap((innings) => innings.commentary), [state]);

  return (
    <header data-testid="live-hero" className="relative -mx-4 overflow-hidden bg-[#0b1430] text-white">
      <div className="relative grid grid-cols-2">
        {SIDES.map((side) => (
          <TeamPanel key={side} state={state} side={side} team={team} />
        ))}
        <div aria-hidden className="absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 -skew-x-12 bg-haldi" />
        <Crowd
          width={400}
          height={24}
          colour="#000000"
          style={{ position: "absolute", bottom: 0, left: 0, width: "100%", opacity: 0.25 }}
        />
      </div>
      <div className="relative flex min-h-11 items-center justify-between gap-3 px-4 py-2">
        <h1 className="min-w-0 truncate text-sm font-bold">
          <bdi>{title}</bdi>
        </h1>
        <Status state={state} outcome={outcome} />
      </div>
      {outcome.kind === "live" && <Crease state={state} team={team} />}
      <BallBurst commentary={commentary} />
      {confetti !== null && <Confetti colours={confetti} />}
    </header>
  );
}
