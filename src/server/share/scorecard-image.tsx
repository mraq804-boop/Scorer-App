import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { formatFigures, formatNeed, formatResult } from "@/lib/i18n/cricket";
import { chaseNeed, formatOvers, playerName } from "@/lib/scoring";
import type { InningsState, MatchState } from "@/lib/scoring";
import { imageText } from "@/lib/share/image-text";
import { matchUrl } from "@/lib/site-url";
import { Brand, Clip, FONT_FAMILY, HALDI, INK, LiveBadge, PAPER, SLATE, WHITE } from "./parts";

export const CARD_SIZE = { width: 1080, height: 1350 };

const PAGE_PADDING = 48;
const HEADER_HEIGHT = 250;
const FOOTER_HEIGHT = 72;
const BODY_PADDING = 24;
const BLOCK_GAP = 24;
const BLOCK_PADDING = 24;
const HEADER_UNITS = 2.2;
const LABEL_UNITS = 0.75;
const MAX_UNIT = 50;
const MIN_UNIT = 24;
const STACKED_MIN_UNIT = 38;
const BODY_HEIGHT = CARD_SIZE.height - HEADER_HEIGHT - FOOTER_HEIGHT - BODY_PADDING * 2;

type Layout = { columns: 1 | 2; unit: number };

function inningsUnits(innings: InningsState): number {
  const section = (rows: number) => (rows === 0 ? 0 : LABEL_UNITS + rows);
  return HEADER_UNITS + section(innings.batting.length) + section(innings.bowling.length);
}

function unitFor(units: number, blocks: number, columns: 1 | 2): number {
  const stackedBlocks = columns === 1 ? blocks : 1;
  const chrome = stackedBlocks * BLOCK_PADDING * 2 + (stackedBlocks - 1) * BLOCK_GAP;
  return Math.min(MAX_UNIT, Math.max(MIN_UNIT, Math.floor((BODY_HEIGHT - chrome) / units)));
}

function layoutFor(state: MatchState): Layout {
  const units = state.innings.map(inningsUnits);
  const stacked = unitFor(units.reduce((sum, value) => sum + value, 0), units.length, 1);
  if (units.length < 2 || stacked >= STACKED_MIN_UNIT) return { columns: 1, unit: stacked };
  return { columns: 2, unit: unitFor(Math.max(...units), units.length, 2) };
}

function Row({ unit, children }: { unit: number; children: ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 16, height: unit }}>{children}</div>;
}

function Figures({ size, children }: { size: number; children: string }) {
  return <div style={{ display: "flex", fontSize: size, fontWeight: 700 }}>{children}</div>;
}

function Label({ unit, border, children }: { unit: number; border?: boolean; children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        height: unit * LABEL_UNITS,
        paddingBottom: 4,
        fontSize: Math.round(unit * 0.36),
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: SLATE,
        ...(border ? { borderTop: "2px solid #e3e6ef" } : {}),
      }}
    >
      {children}
    </div>
  );
}

function InningsBlock({ state, innings, layout }: { state: MatchState; innings: InningsState; layout: Layout }) {
  const { columns, unit } = layout;
  const font = Math.round(unit * 0.62);
  const bowled = innings.bowling.length > 0;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexGrow: columns === 2 ? 1 : 0,
        flexShrink: 0,
        minWidth: 0,
        padding: BLOCK_PADDING,
        borderRadius: 28,
        background: WHITE,
        color: INK,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", height: unit * HEADER_UNITS, justifyContent: "center" }}>
        <div style={{ display: "flex" }}>
          <Clip size={Math.round(unit * 0.7)} weight={700}>
            {imageText(state.teams[innings.battingTeam].name)}
          </Clip>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: Math.round(unit * 0.62), color: SLATE }}>
          <div style={{ display: "flex", fontSize: Math.round(unit * 0.95), fontWeight: 700, color: INK }}>
            {t("score.runsWickets", { runs: innings.runs, wickets: innings.wickets })}
          </div>
          <div style={{ display: "flex" }}>
            {t("scorecard.oversIn", { overs: formatOvers(innings.legalBalls, state.rules.ballsPerOver) })}
          </div>
        </div>
      </div>
      {innings.batting.length > 0 && <Label unit={unit}>{t("scorecard.batting")}</Label>}
      {innings.batting.map((line) => (
        <Row key={line.playerId} unit={unit}>
          <Clip size={font}>{imageText(playerName(state.players, line.playerId))}</Clip>
          <Figures size={font}>{t("score.batter", { runs: line.runs, balls: line.balls })}</Figures>
        </Row>
      ))}
      {bowled && (
        <Label unit={unit} border>
          {t("scorecard.bowling")}
        </Label>
      )}
      {innings.bowling.map((line) => (
        <Row key={line.playerId} unit={unit}>
          <Clip size={font}>{imageText(playerName(state.players, line.playerId))}</Clip>
          <Figures size={font}>{formatFigures(line, state.rules.ballsPerOver)}</Figures>
        </Row>
      ))}
    </div>
  );
}

function statusLine(state: MatchState): string {
  if (state.result !== null) return imageText(formatResult(state.result, state.teams));
  const innings = state.innings.at(-1);
  const need = innings === undefined ? null : chaseNeed(state, innings);
  return need === null ? "" : formatNeed(need.needed, need.ballsLeft);
}

export function ScorecardImage({ state, code }: { state: MatchState; code: string }) {
  const layout = layoutFor(state);
  const { columns } = layout;
  const status = statusLine(state);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: PAPER,
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: HEADER_HEIGHT,
          padding: `32px ${PAGE_PADDING}px`,
          background: INK,
          color: PAPER,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Brand size={56} color={PAPER} />
          {state.status !== "complete" && <LiveBadge size={28} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex" }}>
            <Clip size={46} weight={700} color={WHITE}>
              {imageText(state.title)}
            </Clip>
          </div>
          <div style={{ display: "flex", minHeight: 44, fontSize: 36, fontWeight: 700, color: HALDI }}>{status}</div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: columns === 1 ? "column" : "row",
          flex: 1,
          gap: BLOCK_GAP,
          padding: `${BODY_PADDING}px ${PAGE_PADDING}px`,
          overflow: "hidden",
        }}
      >
        {state.innings.length === 0 && (
          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", fontSize: 36, color: SLATE }}>
            {t("live.notStarted")}
          </div>
        )}
        {state.innings.map((innings) => (
          <InningsBlock key={innings.number} state={state} innings={innings} layout={layout} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: FOOTER_HEIGHT, fontSize: 28, color: SLATE }}>
        {matchUrl(code).replace(/^https?:\/\//, "")}
      </div>
    </div>
  );
}
