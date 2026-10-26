import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { formatDismissal } from "@/lib/i18n/cricket";
import { boundaryPct, dotBallPct, economy, formatOvers, playerName, strikeRate } from "@/lib/scoring";
import type { BatterLine, BowlerLine, InningsState, MatchState } from "@/lib/scoring";
import { cn } from "@/lib/utils";

type Column<Row> = { label: string; width: string; value: (row: Row) => string | number; bold?: boolean };
type InningsProps = { state: MatchState; innings: InningsState };

function percent(value: number): string {
  return t("scorecard.percent", { pct: Number(value.toFixed(1)) });
}

function extrasTotal({ extras }: InningsState): number {
  return extras.wides + extras.noBalls + extras.byes + extras.legByes;
}

function Name({ children, className }: { children: string; className?: string }) {
  return <bdi className={cn("block min-w-0 truncate", className)}>{children}</bdi>;
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      <h4 id={id} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      {children}
    </div>
  );
}

type FigureTableProps<Row extends { playerId: string }> = {
  labelledBy: string;
  nameLabel: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  renderName: (row: Row) => ReactNode;
  footer?: ReactNode;
};

function FigureTable<Row extends { playerId: string }>({
  labelledBy,
  nameLabel,
  columns,
  rows,
  renderName,
  footer,
}: FigureTableProps<Row>) {
  return (
    <table aria-labelledby={labelledBy} className="w-full table-fixed text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="py-1 text-start font-medium">
            {nameLabel}
          </th>
          {columns.map((column) => (
            <th key={column.label} scope="col" className={cn("px-0.5 text-end font-medium", column.width)}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="num">
        {rows.map((row) => (
          <tr key={row.playerId} className="border-t">
            <th scope="row" className="py-1.5 pe-2 text-start font-normal">
              {renderName(row)}
            </th>
            {columns.map((column) => (
              <td key={column.label} className={cn("px-0.5 text-end", column.bold && "font-bold")}>
                {column.value(row)}
              </td>
            ))}
          </tr>
        ))}
        {footer}
      </tbody>
    </table>
  );
}

const BATTING_COLUMNS: readonly Column<BatterLine>[] = [
  { label: t("scorecard.runs"), width: "w-9", value: (line) => line.runs, bold: true },
  { label: t("scorecard.balls"), width: "w-9", value: (line) => line.balls },
  { label: t("scorecard.fours"), width: "w-9", value: (line) => line.fours },
  { label: t("scorecard.sixes"), width: "w-9", value: (line) => line.sixes },
  { label: t("scorecard.strikeRate"), width: "w-14", value: (line) => strikeRate(line.runs, line.balls).toFixed(2) },
];

function bowlingColumns(ballsPerOver: number): Column<BowlerLine>[] {
  return [
    { label: t("scorecard.overs"), width: "w-11", value: (line) => formatOvers(line.legalBalls, ballsPerOver) },
    { label: t("scorecard.maidens"), width: "w-7", value: (line) => line.maidens },
    { label: t("scorecard.runs"), width: "w-8", value: (line) => line.runs },
    { label: t("scorecard.wickets"), width: "w-7", value: (line) => line.wickets, bold: true },
    {
      label: t("scorecard.economy"),
      width: "w-12",
      value: (line) => economy(line.runs, line.legalBalls, ballsPerOver).toFixed(2),
    },
    { label: t("scorecard.wides"), width: "w-7", value: (line) => line.wides },
    { label: t("scorecard.noBalls"), width: "w-7", value: (line) => line.noBalls },
  ];
}

function Batting({ state, innings }: InningsProps) {
  const id = `scorecard-${innings.number}-batting`;
  return (
    <Block id={id} title={t("scorecard.batting")}>
      <FigureTable
        labelledBy={id}
        nameLabel={t("scorecard.batter")}
        columns={BATTING_COLUMNS}
        rows={innings.batting}
        renderName={(line) => (
          <>
            <Name className="font-semibold">{playerName(state.players, line.playerId)}</Name>
            <Name className="text-xs text-muted-foreground">{formatDismissal(line, state.players)}</Name>
          </>
        )}
        footer={
          <>
            <tr className="border-t">
              <th scope="row" className="py-1.5 pe-2 text-start font-normal">
                <span className="block truncate">{t("scorecard.extras")}</span>
              </th>
              <td colSpan={BATTING_COLUMNS.length} className="py-1.5 text-end">
                <span className="font-bold">{extrasTotal(innings)}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {t("scorecard.extrasDetail", {
                    byes: innings.extras.byes,
                    legByes: innings.extras.legByes,
                    wides: innings.extras.wides,
                    noBalls: innings.extras.noBalls,
                  })}
                </span>
              </td>
            </tr>
            <tr className="border-t-2 font-bold">
              <th scope="row" className="py-1.5 pe-2 text-start">
                {t("scorecard.total")}
              </th>
              <td colSpan={BATTING_COLUMNS.length} className="py-1.5 text-end">
                {t("score.runsWickets", { runs: innings.runs, wickets: innings.wickets })}{" "}
                <span className="font-medium text-muted-foreground">
                  {t("scorecard.oversIn", { overs: formatOvers(innings.legalBalls, state.rules.ballsPerOver) })}
                </span>
              </td>
            </tr>
          </>
        }
      />
    </Block>
  );
}

function Bowling({ state, innings }: InningsProps) {
  const id = `scorecard-${innings.number}-bowling`;
  return (
    <Block id={id} title={t("scorecard.bowling")}>
      <FigureTable
        labelledBy={id}
        nameLabel={t("scorecard.bowler")}
        columns={bowlingColumns(state.rules.ballsPerOver)}
        rows={innings.bowling}
        renderName={(line) => <Name className="font-semibold">{playerName(state.players, line.playerId)}</Name>}
      />
    </Block>
  );
}

function FallOfWickets({ state, innings }: InningsProps) {
  return (
    <Block id={`scorecard-${innings.number}-fall`} title={t("scorecard.fallOfWickets")}>
      <ul className="flex flex-col gap-1 text-sm">
        {innings.fallOfWickets.map((fall) => (
          <li key={fall.wicket} className="flex min-w-0 items-baseline gap-1.5">
            <span className="num shrink-0 font-semibold">
              {t("scorecard.fallOfWicket", { wicket: fall.wicket, runs: fall.runs })}
            </span>{" "}
            <Name className="shrink">{playerName(state.players, fall.playerId)}</Name>{" "}
            <span className="num shrink-0 text-muted-foreground">
              {t("scorecard.oversIn", { overs: formatOvers(fall.legalBalls, state.rules.ballsPerOver) })}
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function Partnerships({ state, innings }: InningsProps) {
  return (
    <Block id={`scorecard-${innings.number}-partnerships`} title={t("scorecard.partnerships")}>
      <ul className="flex flex-col gap-1 text-sm">
        {innings.partnerships.map((pair, index) => (
          <li key={index} className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-1">
              <Name className="shrink">{playerName(state.players, pair.batters[0])}</Name>
              {pair.batters[1] !== null && (
                <>
                  <span className="shrink-0 text-muted-foreground">{t("scorecard.and")}</span>
                  <Name className="shrink">{playerName(state.players, pair.batters[1])}</Name>
                </>
              )}
            </span>
            <span className="num shrink-0 font-semibold">{t("score.batter", { runs: pair.runs, balls: pair.balls })}</span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function OverByOver({ state, innings }: InningsProps) {
  return (
    <Block id={`scorecard-${innings.number}-overs`} title={t("scorecard.overByOver")}>
      <ol className="flex flex-col gap-1 text-sm">
        {innings.overs.map((over) => (
          <li key={over.index} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-3">
            <span className="num text-muted-foreground">{t("scorecard.over", { n: over.index + 1 })}</span>
            <Name>{playerName(state.players, over.bowler)}</Name>
            <span className="num font-semibold">{t("score.runsWickets", { runs: over.runs, wickets: over.wickets })}</span>
          </li>
        ))}
      </ol>
    </Block>
  );
}

function Rates({ innings }: { innings: InningsState }) {
  const rates = [
    { label: t("scorecard.dotBalls"), value: dotBallPct(innings) },
    { label: t("scorecard.boundaryRuns"), value: boundaryPct(innings) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3">
      {rates.map((rate) => (
        <div key={rate.label} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-muted p-3">
          <dt className="text-xs text-muted-foreground">{rate.label}</dt>
          <dd className="num text-lg font-bold">{percent(rate.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function InningsCard({ state, innings }: InningsProps) {
  const headingId = `scorecard-${innings.number}`;
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4">
      <h3
        id={headingId}
        className="flex items-baseline justify-between gap-3 border-b-2 border-primary pb-1.5 text-lg font-extrabold"
      >
        <bdi className="min-w-0 truncate">{state.teams[innings.battingTeam].name}</bdi>
        <span className="num shrink-0">
          {t("score.runsWickets", { runs: innings.runs, wickets: innings.wickets })}{" "}
          <span className="text-sm font-semibold text-muted-foreground">
            {t("scorecard.oversIn", { overs: formatOvers(innings.legalBalls, state.rules.ballsPerOver) })}
          </span>
        </span>
      </h3>
      <Batting state={state} innings={innings} />
      <Bowling state={state} innings={innings} />
      {innings.fallOfWickets.length > 0 && <FallOfWickets state={state} innings={innings} />}
      <Partnerships state={state} innings={innings} />
      <OverByOver state={state} innings={innings} />
      <Rates innings={innings} />
    </section>
  );
}

export function Scorecard({ state }: { state: MatchState }) {
  return (
    <div data-testid="scorecard" className="flex min-w-0 flex-col gap-8">
      {state.innings.map((innings) => (
        <InningsCard key={innings.number} state={state} innings={innings} />
      ))}
    </div>
  );
}
