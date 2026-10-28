import type { ReactNode } from "react";
import { ConfettiPieces, Crowd, Floodlights, PitchArc } from "@/components/art/cricket-art";
import { colourFor, initials } from "@/lib/brand";
import type { TeamColour } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { formatNeed, formatResult } from "@/lib/i18n/cricket";
import { chaseNeed, formatOvers } from "@/lib/scoring";
import type { MatchState, TeamSide } from "@/lib/scoring";
import { posterOutcome, potmFromState } from "@/lib/team";
import type { PosterOutcome } from "@/lib/team";
import { imageText } from "@/lib/share/image-text";
import { FONT_FAMILY, HALDI, INK, PAPER } from "./parts";
import type { MatchBrand } from "./match";

export const NIGHT = "#0b1430";
export const PALE_GOLD = "#FAC775";
export const GOLD_INK = "#412402";

const CHAR_WIDTH_EM = 0.58;

export type PosterTeam = { name: string; colour: TeamColour; logoUrl: string | null };

export function posterTeam(state: MatchState, side: TeamSide, brand: MatchBrand): PosterTeam {
  const name = state.teams[side].name;
  const ours = brand !== null && brand.side === side;
  return { name, colour: colourFor(ours ? brand.colour : null, name), logoUrl: ours ? brand.logoUrl : null };
}

export function brandPotm(state: MatchState, brand: MatchBrand): string | null {
  if (brand === null || posterOutcome(state, brand.resultOverride).kind === "live") return null;
  return potmFromState(state, brand.side, brand.xi, brand.potmPlayerId);
}

export function fitFontSize(text: string, max: number, min: number, width: number): number {
  const fits = Math.floor(width / (Math.max(text.length, 1) * CHAR_WIDTH_EM));
  return Math.max(min, Math.min(max, fits));
}

export function teamScore(state: MatchState, side: TeamSide): { score: string; overs: string | null; batted: boolean } {
  const innings = state.innings.find((candidate) => candidate.battingTeam === side);
  if (innings === undefined) return { score: t("poster.yetToBat"), overs: null, batted: false };
  return {
    batted: true,
    score: t("score.runsWickets", { runs: innings.runs, wickets: innings.wickets }),
    overs: t("scorecard.oversIn", { overs: formatOvers(innings.legalBalls, state.rules.ballsPerOver) }),
  };
}

export function bannerText(state: MatchState, outcome: PosterOutcome): string {
  switch (outcome.kind) {
    case "won":
      return state.result === null ? "" : imageText(formatResult(state.result, state.teams));
    case "tie":
      return t("poster.tied");
    case "noResult":
      return t("poster.noResult");
    case "live": {
      if (state.status === "innings_break") return t("poster.inningsBreak");
      const innings = state.innings.at(-1);
      const need = innings === undefined ? null : chaseNeed(state, innings);
      if (need !== null) return formatNeed(need.needed, need.ballsLeft);
      return innings === undefined ? t("share.liveBadge") : imageText(t("poster.batting", { team: state.teams[innings.battingTeam].name }));
    }
  }
}

type StageProps = { width: number; height: number; confetti: boolean; children: ReactNode };

export function Stage({ width, height, confetti, children }: StageProps) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width,
        height,
        background: NIGHT,
        color: PAPER,
        fontFamily: FONT_FAMILY,
        overflow: "hidden",
      }}
    >
      <Floodlights width={width} height={Math.round(width / 2)} style={{ position: "absolute", top: 0, left: 0 }} />
      <Crowd
        width={width}
        height={Math.round(width * 0.1)}
        colour={INK}
        style={{ position: "absolute", bottom: Math.round(height * 0.17), left: 0 }}
      />
      <PitchArc width={width} height={Math.round(height * 0.2)} style={{ position: "absolute", bottom: 0, left: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", position: "relative", width: "100%", height: "100%" }}>
        {children}
      </div>
      {confetti && (
        <ConfettiPieces width={width} height={Math.round(width * 0.3)} style={{ position: "absolute", top: Math.round(height * 0.02), left: 0 }} />
      )}
    </div>
  );
}

type DiscProps = { size: number; colour: TeamColour; name: string; photoUrl: string | null; ring?: number };

export function Disc({ size, colour, name, photoUrl, ring = 0 }: DiscProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: size,
        background: colour.light,
        border: ring > 0 ? `${ring}px solid ${HALDI}` : "none",
        overflow: "hidden",
      }}
    >
      {photoUrl === null ? (
        <div style={{ display: "flex", fontSize: Math.round(size * 0.38), fontWeight: 700, color: colour.dark }}>
          {imageText(initials(name))}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" width={size} height={size} style={{ objectFit: "cover" }} />
      )}
    </div>
  );
}
