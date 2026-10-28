import { Bat, Stumps, Trophy } from "@/components/art/cricket-art";
import { colourFor } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { formatPerformer } from "@/lib/i18n/team";
import type { MatchState, TeamSide } from "@/lib/scoring";
import { posterOutcome, topPerformers } from "@/lib/team";
import type { Performer } from "@/lib/team";
import { imageText } from "@/lib/share/image-text";
import type { MatchBrand } from "./match";
import { Brand, Clip, HALDI, LiveBadge, PAPER, WHITE } from "./parts";
import { Disc, GOLD_INK, PALE_GOLD, Stage, bannerText, brandPotm, fitFontSize, posterTeam, teamScore } from "./poster-parts";

export const RESULT_POSTER_SIZE = { width: 1080, height: 1350 };

const SIDES: readonly TeamSide[] = ["A", "B"];
const PANEL_HEIGHT = 470;
const BANNER_WIDTH = 834;

type ResultPosterProps = { state: MatchState; brand: MatchBrand };

function Panel({ state, side, brand }: { state: MatchState; side: TeamSide; brand: MatchBrand }) {
  const team = posterTeam(state, side, brand);
  const { score, overs, batted } = teamScore(state, side);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        minWidth: 0,
        gap: 12,
        padding: "0 40px 44px",
        background: team.colour.base,
        color: team.colour.on,
      }}
    >
      <Disc size={150} colour={team.colour} name={team.name} photoUrl={team.logoUrl} ring={6} />
      <div style={{ display: "flex", width: "100%", justifyContent: "center" }}>
        <Clip size={40} weight={700} color={team.colour.on} align="center">
          {imageText(team.name)}
        </Clip>
      </div>
      <div style={{ display: "flex", fontSize: batted ? 104 : 52, fontWeight: 700, lineHeight: 1 }}>{score}</div>
      {overs !== null && <div style={{ display: "flex", fontSize: 30 }}>{overs}</div>}
    </div>
  );
}

function PerformerRow({ performer, state, brand, potm }: { performer: Performer; state: MatchState; brand: MatchBrand; potm: boolean }) {
  const ours = brand !== null && brand.side === performer.side;
  const colour = ours ? colourFor(brand.colour, state.teams[performer.side].name) : colourFor(null, state.teams[performer.side].name);
  const photoUrl = ours ? brand.photoUrlOf(performer.playerId) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <Disc size={88} colour={colour} name={performer.name} photoUrl={photoUrl} ring={potm ? 5 : 0} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex" }}>
          <Clip size={42} weight={700} color={potm ? PALE_GOLD : WHITE}>
            {imageText(performer.name)}
          </Clip>
        </div>
        {potm && <div style={{ display: "flex", fontSize: 26, color: PALE_GOLD }}>{t("poster.potm")}</div>}
      </div>
      <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: potm ? PALE_GOLD : WHITE }}>
        {formatPerformer(performer.stats)}
      </div>
    </div>
  );
}

export function ResultPoster({ state, brand }: ResultPosterProps) {
  const outcome = posterOutcome(state, brand?.resultOverride ?? null);
  const performers = topPerformers(state);
  const potm = brandPotm(state, brand);
  const banner = bannerText(state, outcome);
  const { width, height } = RESULT_POSTER_SIZE;
  return (
    <Stage width={width} height={height} confetti={outcome.kind === "won"}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, padding: "56px 56px 104px" }}>
        <Brand size={56} color={PAPER} />
        {outcome.kind === "live" && <LiveBadge size={30} />}
      </div>
      <div style={{ display: "flex", position: "relative", height: PANEL_HEIGHT }}>
        {SIDES.map((side) => (
          <Panel key={side} state={state} side={side} brand={brand} />
        ))}
        <svg width={width} height={PANEL_HEIGHT} style={{ position: "absolute", top: 0, left: 0 }}>
          <polygon points={`${width / 2 + 40},0 ${width / 2 + 64},0 ${width / 2 - 40},${PANEL_HEIGHT} ${width / 2 - 64},${PANEL_HEIGHT}`} fill={HALDI} />
        </svg>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          margin: "-36px 56px 0",
          padding: "20px 32px",
          borderRadius: 28,
          background: HALDI,
          color: GOLD_INK,
        }}
      >
        <Trophy width={52} height={56} colour={GOLD_INK} />
        <Clip size={fitFontSize(banner, 46, 28, BANNER_WIDTH)} weight={700} color={GOLD_INK}>
          {banner}
        </Clip>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "44px 56px 0" }}>
        {performers.length > 0 && (
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: PALE_GOLD }}>{t("poster.topPerformers")}</div>
        )}
        {performers.map((performer) => (
          <PerformerRow
            key={performer.playerId}
            performer={performer}
            state={state}
            brand={brand}
            potm={potm === performer.playerId}
          />
        ))}
      </div>
      <div style={{ display: "flex", position: "absolute", right: 56, bottom: 40, alignItems: "flex-end", gap: 8 }}>
        <Bat width={150} height={50} />
        <Stumps width={80} height={120} />
      </div>
    </Stage>
  );
}
