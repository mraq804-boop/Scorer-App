import type { BowlerLine, EventDraft, InningsState, MatchState, Player, TeamSide } from "@/lib/scoring";
import type { LocalMatch } from "@/lib/local/db";
import { sameName } from "@/lib/validation/match-setup";

export type PlayerChoice = { id: string; drafts: EventDraft[] };
export type XiPlayer = { id: string; name: string };
export type MatchTeam = NonNullable<LocalMatch["team"]> & { bench?: readonly XiPlayer[] };

type PlayerFilter = (player: Player) => boolean;

const NO_XI: readonly XiPlayer[] = [];

export function choosePlayer(
  state: MatchState,
  team: TeamSide,
  name: string,
  squadId?: string,
  canReuse: PlayerFilter = () => true,
): PlayerChoice {
  const wanted = name.trim();
  if (squadId !== undefined) {
    const known = state.players[squadId];
    if (known !== undefined) return { id: known.id, drafts: [] };
    const player: Player = { id: squadId, name: wanted, team };
    return { id: player.id, drafts: [{ type: "player_added", player }] };
  }
  const existing = Object.values(state.players).find(
    (player) => player.team === team && sameName(player.name, wanted) && canReuse(player),
  );
  if (existing !== undefined) return { id: existing.id, drafts: [] };
  const player: Player = { id: crypto.randomUUID(), name: wanted, team };
  return { id: player.id, drafts: [{ type: "player_added", player }] };
}

export function xiFor(team: MatchTeam | undefined, side: TeamSide): readonly XiPlayer[] {
  return team?.side === side ? team.xi : NO_XI;
}

export function benchFor(team: MatchTeam | undefined, side: TeamSide): readonly XiPlayer[] {
  return team?.side === side ? (team.bench ?? NO_XI) : NO_XI;
}

export function joiningXi(drafts: readonly EventDraft[], team: MatchTeam | undefined): XiPlayer[] {
  const bench = team?.bench ?? NO_XI;
  return drafts.flatMap((draft) =>
    draft.type === "player_added" && draft.player.team === team?.side && bench.some((member) => member.id === draft.player.id)
      ? [{ id: draft.player.id, name: draft.player.name }]
      : [],
  );
}

export function chooseTypedPlayer(
  state: MatchState,
  team: TeamSide,
  typed: string,
  xi: readonly XiPlayer[],
  canReuse: PlayerFilter = () => true,
  bench: readonly XiPlayer[] = NO_XI,
): PlayerChoice | "ambiguous" {
  if (xi.length === 0) return choosePlayer(state, team, typed, undefined, canReuse);
  const wanted = typed.trim();
  const inMatch = Object.values(state.players).filter(
    (player) => player.team === team && sameName(player.name, wanted) && canReuse(player),
  );
  const squad = [...xi, ...bench].filter(
    (member, index, members) =>
      sameName(member.name, wanted) &&
      members.findIndex((other) => other.id === member.id) === index &&
      !inMatch.some((known) => known.id === member.id) &&
      canReuse({ id: member.id, name: member.name, team }),
  );
  if (inMatch.length + squad.length > 1) return "ambiguous";
  const [only] = squad;
  if (only === undefined) return choosePlayer(state, team, wanted, undefined, canReuse);
  return choosePlayer(state, team, only.name, only.id);
}

export function fielderOptions(xi: readonly XiPlayer[], state: MatchState, bowlerId: string | null): XiPlayer[] {
  if (xi.length === 0) return [];
  const bowler = bowlerId === null ? undefined : state.players[bowlerId];
  if (bowler === undefined || xi.some((player) => player.id === bowler.id)) return [...xi];
  return [...xi, { id: bowler.id, name: bowler.name }];
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

export function previousBowlers(innings: InningsState): BowlerLine[] {
  const others = innings.bowling.filter((line) => line.playerId !== innings.bowler);
  if (innings.bowler !== null) return others;
  const justBowled = innings.commentary.at(-1)?.bowler;
  return [
    ...others.filter((line) => line.playerId !== justBowled),
    ...others.filter((line) => line.playerId === justBowled),
  ];
}
