import type { CachedTeam, LocalDb, SquadOutboxRow } from "@/lib/local/db";
import { requestSync } from "@/lib/sync/sync";
import type { SquadPlayer, SquadRole } from "./types";

export const SQUAD_NAME_MAX_LENGTH = 40;
export const SQUAD_MAX_PLAYERS = 60;

export type SquadAddErrorCode = "no_team" | "name_required" | "name_too_long" | "squad_full";

export class SquadAddError extends Error {
  readonly code: SquadAddErrorCode;

  constructor(code: SquadAddErrorCode) {
    super(code);
    this.name = "SquadAddError";
    this.code = code;
  }
}

export async function getCachedTeam(db: LocalDb): Promise<CachedTeam | undefined> {
  return db.team.toCollection().first();
}

export async function cacheTeam(db: LocalDb, team: CachedTeam): Promise<void> {
  await db.transaction("rw", db.team, async () => {
    await db.team.clear();
    await db.team.put(team);
  });
}

export async function clearCachedTeam(db: LocalDb): Promise<void> {
  await db.team.clear();
}

function withoutTeamId(row: SquadOutboxRow): SquadPlayer {
  const { teamId, ...player } = row;
  void teamId;
  return player;
}

export async function addSquadPlayerOffline(
  db: LocalDb,
  input: { name: string; role: SquadRole | null },
): Promise<SquadPlayer> {
  const name = input.name.trim();
  if (name === "") throw new SquadAddError("name_required");
  if (Array.from(name).length > SQUAD_NAME_MAX_LENGTH) throw new SquadAddError("name_too_long");
  const player = await db.transaction("rw", db.team, db.squadOutbox, async () => {
    const team = await db.team.toCollection().first();
    if (team === undefined) throw new SquadAddError("no_team");
    if (team.squad.length >= SQUAD_MAX_PLAYERS) throw new SquadAddError("squad_full");
    const added: SquadPlayer = { id: crypto.randomUUID(), name, role: input.role, active: true };
    await db.team.put({ ...team, squad: [...team.squad, added] });
    await db.squadOutbox.add({ ...added, teamId: team.id });
    return added;
  });
  requestSync();
  return player;
}

export async function getSquadOutboxByTeam(db: LocalDb): Promise<Map<string, SquadPlayer[]>> {
  const groups = new Map<string, SquadPlayer[]>();
  for (const row of await db.squadOutbox.toArray()) {
    const group = groups.get(row.teamId) ?? [];
    group.push(withoutTeamId(row));
    groups.set(row.teamId, group);
  }
  return groups;
}

export async function getSquadOutbox(db: LocalDb, teamId: string): Promise<SquadPlayer[]> {
  return (await getSquadOutboxByTeam(db)).get(teamId) ?? [];
}

export async function removeFromSquadOutbox(db: LocalDb, ids: string[]): Promise<void> {
  await db.squadOutbox.bulkDelete(ids);
}
