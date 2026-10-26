import { t } from "@/lib/i18n";
import { formatFigures, formatNeed } from "@/lib/i18n/cricket";
import { chaseNeed, formatOvers, playerName, requiredRunRate, runRate } from "@/lib/scoring";
import type { BatterLine, BowlerLine, InningsState, MatchState } from "@/lib/scoring";
import { cn } from "@/lib/utils";

function BatterRow({ state, line, striker }: { state: MatchState; line: BatterLine; striker: boolean }) {
  return (
    <li
      data-testid={striker ? "striker" : "non-striker"}
      className={cn("flex items-baseline justify-between gap-3", !striker && "opacity-80")}
    >
      <span className={cn("flex min-w-0 items-baseline gap-0.5", striker && "font-bold")}>
        <bdi className="min-w-0 truncate">{playerName(state.players, line.playerId)}</bdi>
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
    <p data-testid="bowler" className="flex items-baseline justify-between gap-3">
      <bdi className="min-w-0 truncate">{playerName(state.players, playerId)}</bdi>
      <span className="num shrink-0 font-semibold">{formatFigures(figures, state.rules.ballsPerOver)}</span>
    </p>
  );
}

export function Scoreboard({ state, innings }: { state: MatchState; innings: InningsState }) {
  const bpo = state.rules.ballsPerOver;
  const live = chaseNeed(state, innings);
  const atCrease = innings.batting.filter(
    (line) => line.playerId === innings.striker || line.playerId === innings.nonStriker,
  );
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-primary p-4 text-primary-foreground">
      <div className="flex items-center justify-between gap-3">
        <bdi className="min-w-0 truncate text-sm font-semibold opacity-80">{state.teams[innings.battingTeam].name}</bdi>
        {innings.freeHit && (
          <span className="shrink-0 rounded-full bg-haldi px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-black">
            {t("score.freeHit")}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p data-testid="score" className="num flex items-baseline gap-2 leading-none font-extrabold">
          <span className="text-5xl">{t("score.runsWickets", { runs: innings.runs, wickets: innings.wickets })}</span>{" "}
          <span className="text-2xl opacity-80">{t("score.overs", { overs: formatOvers(innings.legalBalls, bpo) })}</span>
        </p>
        <div className="num flex shrink-0 flex-col items-end text-sm font-semibold">
          <span>{t("score.crr", { rate: runRate(innings.runs, innings.legalBalls, bpo).toFixed(2) })}</span>
          {live !== null && (
            <span>{t("score.rrr", { rate: (requiredRunRate(live.needed, live.ballsLeft, bpo) ?? 0).toFixed(2) })}</span>
          )}
        </div>
      </div>
      {live !== null && <p className="text-base font-bold text-haldi">{formatNeed(live.needed, live.ballsLeft)}</p>}
      {(atCrease.length > 0 || innings.bowler !== null) && (
        <div className="flex flex-col gap-1.5 border-t border-primary-foreground/20 pt-3 text-base">
          <ul className="flex flex-col gap-1">
            {atCrease.map((line) => (
              <BatterRow key={line.playerId} state={state} line={line} striker={line.playerId === innings.striker} />
            ))}
          </ul>
          {innings.bowler !== null && (
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
