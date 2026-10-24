import { currentInnings } from "./replay";
import type { MatchState, Prompt } from "./types";

export function nextPrompt(state: MatchState): Prompt | null {
  if (state.status === "setup") return { kind: "start_innings", innings: 1 };
  const innings = currentInnings(state);
  if (innings !== null && innings.bowler === null) return { kind: "choose_bowler" };
  return null;
}
