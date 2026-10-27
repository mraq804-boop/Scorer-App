import type { CachedTeam, LocalDb, SquadOutboxRow } from "@/lib/local/db";
import type { SquadPlayer, SquadRole } from "./types";

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
  return db.transaction("rw", db.team, db.squadOutbox, async () => {
    const team = await db.team.toCollection().first();
    if (team === undefined) throw new Error("No cached team");
    const player: SquadPlayer = { id: crypto.randomUUID(), name: input.name, role: input.role, active: true };
    await db.team.put({ ...team, squad: [...team.squad, player] });
    await db.squadOutbox.add({ ...player, teamId: team.id });
    return player;
  });
}

export async function getSquadOutbox(db: LocalDb, teamId: string): Promise<SquadPlayer[]> {
  const rows = await db.squadOutbox.toArray();
  return rows.filter((row) => row.teamId === teamId).map(withoutTeamId);
}

export async function removeFromSquadOutbox(db: LocalDb, ids: string[]): Promise<void> {
  await db.squadOutbox.bulkDelete(ids);
}
