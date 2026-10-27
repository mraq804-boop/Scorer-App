import { currentInnings } from "./replay";
import { EngineError } from "./rules";
import type { BallInput, BallKind, EventDraft, MatchState, Rules } from "./types";

function penaltyFor(kind: BallKind, rules: Rules): number {
  if (kind === "wide") return rules.wideRuns;
  if (kind === "noball") return rules.noBallRuns;
  return 0;
}

export function deliveryDraft(state: MatchState, input: BallInput): Extract<EventDraft, { type: "delivery" }> {
  const innings = currentInnings(state);
  if (innings === null) throw new EngineError("no_innings");
  if (innings.striker === null) throw new EngineError("no_striker");
  if (innings.bowler === null) throw new EngineError("no_bowler");

  const kind = input.kind ?? "legal";
  return {
    type: "delivery",
    striker: innings.striker,
    nonStriker: innings.nonStriker,
    bowler: innings.bowler,
    kind,
    runs: input.runs,
    runsAs: input.runsAs ?? "bat",
    boundary: input.boundary ?? false,
    penalty: penaltyFor(kind, state.rules),
    wicket: input.wicket
      ? {
          kind: input.wicket.kind,
          playerOut: input.wicket.playerOut ?? innings.striker,
          fielderName: input.wicket.fielderName ?? null,
          ...(input.wicket.fielderId !== undefined ? { fielderId: input.wicket.fielderId } : {}),
        }
      : null,
  };
}
