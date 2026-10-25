import type { EventDraft, MatchState, Player, TeamSide } from "@/lib/scoring";
import { sameName } from "@/lib/validation/match-setup";

export type PlayerChoice = { id: string; drafts: EventDraft[] };

type PlayerFilter = (player: Player) => boolean;

export function choosePlayer(
  state: MatchState,
  team: TeamSide,
  name: string,
  canReuse: PlayerFilter = () => true,
): PlayerChoice {
  const wanted = name.trim();
  const existing = Object.values(state.players).find(
    (player) => player.team === team && sameName(player.name, wanted) && canReuse(player),
  );
  if (existing !== undefined) return { id: existing.id, drafts: [] };
  const player: Player = { id: crypto.randomUUID(), name: wanted, team };
  return { id: player.id, drafts: [{ type: "player_added", player }] };
}

export function suggestNames(
  state: MatchState,
  team: TeamSide,
  recent: readonly string[],
  skip: PlayerFilter = () => false,
): string[] {
  const taken = new Set<string>();
  const names: string[] = [];
  const players = Object.values(state.players);
  for (const player of players) {
    if (player.team !== team || skip(player)) taken.add(player.name.toLocaleLowerCase());
  }
  const offer = (name: string) => {
    const key = name.toLocaleLowerCase();
    if (taken.has(key)) return;
    taken.add(key);
    names.push(name);
  };
  for (const player of players) if (player.team === team && !skip(player)) offer(player.name);
  for (const name of recent) offer(name);
  return names;
}
