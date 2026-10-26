import { t } from "@/lib/i18n";
import { formatNeed, formatResult } from "@/lib/i18n/cricket";
import { chaseNeed, formatOvers } from "@/lib/scoring";
import type { InningsState, MatchState } from "@/lib/scoring";
import { imageText } from "@/lib/share/image-text";
import { Brand, Clip, FONT_FAMILY, HALDI, INK, LiveBadge, PAPER, WHITE } from "./parts";

export const PREVIEW_SIZE = { width: 1200, height: 630 };

function InningsRow({ state, innings }: { state: MatchState; innings: InningsState }) {
  const need = chaseNeed(state, innings);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <Clip size={42} weight={700}>
          {imageText(state.teams[innings.battingTeam].name)}
        </Clip>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: WHITE }}>
            {t("score.runsWickets", { runs: innings.runs, wickets: innings.wickets })}
          </div>
          <div style={{ display: "flex", width: 190, fontSize: 32, color: PAPER, opacity: 0.8 }}>
            {t("scorecard.oversIn", { overs: formatOvers(innings.legalBalls, state.rules.ballsPerOver) })}
          </div>
        </div>
      </div>
      {need !== null && (
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: HALDI }}>
          {formatNeed(need.needed, need.ballsLeft)}
        </div>
      )}
    </div>
  );
}

export function PreviewImage({ state }: { state: MatchState }) {
  const complete = state.status === "complete";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 56,
        background: INK,
        color: PAPER,
        fontFamily: FONT_FAMILY,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Brand size={56} color={PAPER} />
        {!complete && <LiveBadge size={30} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 24 }}>
        <div style={{ display: "flex" }}>
          <Clip size={48} weight={700} color={WHITE}>
            {imageText(state.title)}
          </Clip>
        </div>
        {state.innings.map((innings) => (
          <InningsRow key={innings.number} state={state} innings={innings} />
        ))}
        {complete && state.result !== null && (
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: HALDI }}>
            {imageText(formatResult(state.result, state.teams))}
          </div>
        )}
      </div>
    </div>
  );
}
