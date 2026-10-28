import { Bat, Crown, Stumps } from "@/components/art/cricket-art";
import { colourFor } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { headlineLabel } from "@/lib/i18n/team";
import { formatOvers, otherSide } from "@/lib/scoring";
import type { MatchState } from "@/lib/scoring";
import { matchRecord, posterHeadline, posterOutcome } from "@/lib/team";
import type { PlayerMatchStats } from "@/lib/team";
import { imageText } from "@/lib/share/image-text";
import type { MatchBrand, SharedMatch } from "./match";
import { Brand, Clip, HALDI, PAPER, WHITE } from "./parts";
import { Disc, GOLD_INK, PALE_GOLD, Stage, bannerText, brandPotm } from "./poster-parts";

export const PLAYER_POSTER_SIZE = { width: 1080, height: 1350 };

export type TeamBrand = NonNullable<MatchBrand>;

type Figure = { value: string; caption: string };

export function posterBrand(shared: SharedMatch, playerId: string): TeamBrand | null {
  const { state, brand } = shared;
  if (brand === null || !brand.xi.includes(playerId)) return null;
  return posterOutcome(state, brand.resultOverride).kind === "live" ? null : brand;
}

function figuresOf(stats: PlayerMatchStats | undefined, ballsPerOver: number): Figure[] {
  if (stats === undefined) return [];
  const figures: Figure[] = [];
  const { batting, bowling, fielding } = stats;
  if (batting !== null) {
    figures.push({
      value: `${batting.runs}${batting.notOut ? "*" : ""}`,
      caption: t("poster.runs", { balls: batting.balls }),
    });
  }
  if (bowling !== null && bowling.legalBalls > 0) {
    figures.push({
      value: t("teamPage.best", { wickets: bowling.wickets, runs: bowling.runs }),
      caption: t("poster.wickets", { overs: formatOvers(bowling.legalBalls, ballsPerOver) }),
    });
  }
  if (figures.length < 2 && fielding.catches > 0) {
    figures.push({ value: String(fielding.catches), caption: t("poster.catches") });
  }
  return figures;
}

type PlayerPosterProps = { state: MatchState; brand: TeamBrand; playerId: string };

export function PlayerPoster({ state, brand, playerId }: PlayerPosterProps) {
  const { width, height } = PLAYER_POSTER_SIZE;
  const teamName = state.teams[brand.side].name;
  const colour = colourFor(brand.colour, teamName);
  const name = state.players[playerId]?.name ?? "";
  const stats = matchRecord(state, brand.side, brand.xi, "").players.find((player) => player.playerId === playerId);
  const potm = brandPotm(state, brand) === playerId;
  const headline = stats === undefined ? null : posterHeadline(stats, potm);
  const figures = figuresOf(stats, state.rules.ballsPerOver);
  const outcome = posterOutcome(state, brand.resultOverride);
  return (
    <Stage width={width} height={height} confetti>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          margin: "48px 56px 0",
          padding: "16px 28px",
          borderRadius: 28,
          background: colour.base,
          color: colour.on,
        }}
      >
        <Disc size={92} colour={colour} name={teamName} photoUrl={brand.logoUrl} ring={4} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <Clip size={44} weight={700} color={colour.on}>
            {imageText(teamName)}
          </Clip>
          <Clip size={30} color={colour.on}>
            {imageText(t("poster.versus", { team: state.teams[otherSide(brand.side)].name }))}
          </Clip>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", height: 96, marginTop: 36 }}>
        {headline !== null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "0 40px",
              borderRadius: 96,
              background: HALDI,
              color: GOLD_INK,
              fontSize: 48,
              fontWeight: 700,
            }}
          >
            {headline === "potm" && <Crown width={56} height={42} colour={GOLD_INK} />}
            {headlineLabel(headline).toUpperCase()}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 32 }}>
        <div style={{ display: "flex", padding: 14, borderRadius: 460, background: colour.base }}>
          <Disc size={400} colour={colour} name={name} photoUrl={brand.photoUrlOf(playerId)} ring={10} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "28px 56px 0" }}>
        <Clip size={76} weight={700} color={WHITE} align="center">
          {imageText(name)}
        </Clip>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 72, marginTop: 20 }}>
        {figures.map((figure) => (
          <div key={figure.caption} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 140, fontWeight: 700, lineHeight: 1, color: PAPER }}>{figure.value}</div>
            <div style={{ display: "flex", fontSize: 32, color: PALE_GOLD }}>{figure.caption}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "28px 56px 0" }}>
        <div style={{ display: "flex", maxWidth: "100%", padding: "10px 36px", borderRadius: 40, background: HALDI }}>
          <Clip size={36} weight={700} color={GOLD_INK} align="center">
            {bannerText(state, outcome)}
          </Clip>
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", left: 56, bottom: 44 }}>
        <Brand size={40} color={PAPER} />
      </div>
      <div style={{ display: "flex", position: "absolute", right: 56, bottom: 40, alignItems: "flex-end", gap: 8 }}>
        <Bat width={130} height={44} />
        <Stumps width={70} height={104} />
      </div>
    </Stage>
  );
}
