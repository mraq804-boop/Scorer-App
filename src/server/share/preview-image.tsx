import { Stumps } from "@/components/art/cricket-art";
import type { MatchState, TeamSide } from "@/lib/scoring";
import { posterOutcome } from "@/lib/team";
import { imageText } from "@/lib/share/image-text";
import type { MatchBrand } from "./match";
import { Brand, Clip, HALDI, LiveBadge, PAPER, WHITE } from "./parts";
import { Disc, GOLD_INK, Stage, bannerText, fitFontSize, posterTeam, teamScore } from "./poster-parts";

export const PREVIEW_SIZE = { width: 1200, height: 630 };

const SIDES: readonly TeamSide[] = ["A", "B"];
const BANNER_WIDTH = 908;

function TeamRow({ state, side, brand }: { state: MatchState; side: TeamSide; brand: MatchBrand }) {
  const team = posterTeam(state, side, brand);
  const { score, overs, batted } = teamScore(state, side);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "14px 24px",
        borderRadius: 28,
        background: team.colour.base,
        color: team.colour.on,
      }}
    >
      <Disc size={84} colour={team.colour} name={team.name} photoUrl={team.logoUrl} ring={4} />
      <Clip size={42} weight={700} color={team.colour.on}>
        {imageText(team.name)}
      </Clip>
      <div style={{ display: "flex", fontSize: batted ? 64 : 34, fontWeight: 700 }}>{score}</div>
      {overs !== null && <div style={{ display: "flex", width: 170, fontSize: 28 }}>{overs}</div>}
    </div>
  );
}

export function PreviewImage({ state, brand }: { state: MatchState; brand: MatchBrand }) {
  const outcome = posterOutcome(state, brand?.resultOverride ?? null);
  const { width, height } = PREVIEW_SIZE;
  const banner = bannerText(state, outcome);
  return (
    <Stage width={width} height={height} confetti={outcome.kind === "won"}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 22, padding: "36px 48px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
          <Brand size={52} color={PAPER} />
          {outcome.kind === "live" && <LiveBadge size={30} />}
        </div>
        {SIDES.map((side) => (
          <TeamRow key={side} state={state} side={side} brand={brand} />
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: "auto",
            padding: "14px 28px",
            borderRadius: 24,
            background: HALDI,
            color: GOLD_INK,
            marginRight: 140,
          }}
        >
          <Clip size={fitFontSize(banner, 40, 26, BANNER_WIDTH)} weight={700} color={GOLD_INK}>
            {banner}
          </Clip>
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", right: 48, bottom: 32 }}>
        <Stumps width={90} height={130} colour={WHITE} />
      </div>
    </Stage>
  );
}
