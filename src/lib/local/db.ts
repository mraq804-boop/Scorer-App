import Dexie, { type Table } from "dexie";
import type { MatchEvent, Rules, TeamSide } from "@/lib/scoring";
import type { MatchSummary } from "@/lib/share/summary";
import type { Season, SquadPlayer } from "@/lib/team";

export type LocalMatch = {
  id: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  lastSeq: number;
  syncedSeq: number;
  syncState: "pending" | "synced" | "blocked";
  blockedReason: "scoring_moved" | "not_owner" | null;
  summary: MatchSummary;
  rules: Rules;
  teams: [string, string];
  title: string;
  team?: { id: string; side: TeamSide; fixtureId: string | null; xi: { id: string; name: string }[] };
};

export type CachedFixture = {
  id: string;
  startsAt: string;
  opponent: string;
  ground: string | null;
  homeAway: "home" | "away" | null;
  overs: number | null;
  status: "scheduled" | "played" | "cancelled";
  matchCode: string | null;
  notes: string | null;
};

export type CachedTeam = {
  id: string;
  role: "owner" | "scorer";
  code: string;
  name: string;
  homeGround: string | null;
  timeZone: string;
  squad: SquadPlayer[];
  seasons: Season[];
  fixtures: CachedFixture[];
  fetchedAt: string;
};

export type SquadOutboxRow = SquadPlayer & { teamId: string };

export type StoredEvent = MatchEvent & { matchId: string };

type MetaRow = { key: string; value: string | StoredEvent[] };

export type StorageCheck = { ok: true } | { ok: false; reason: "unavailable" | "quota" };

const QUOTA_LIMIT = 0.95;

export class LocalDb extends Dexie {
  declare matches: Table<LocalMatch, string>;
  declare events: Table<StoredEvent, [string, number]>;
  declare meta: Table<MetaRow, string>;
  declare team: Table<CachedTeam, string>;
  declare squadOutbox: Table<SquadOutboxRow, string>;

  constructor(name = "cricket-scorer") {
    super(name);
    this.version(1).stores({
      matches: "id, code, updatedAt",
      events: "[matchId+seq], id, matchId",
      meta: "key",
    });
    this.version(2).stores({
      team: "id",
      squadOutbox: "id",
    });
  }
}

let instance: LocalDb | undefined;

export function getLocalDb(): LocalDb {
  instance ??= new LocalDb();
  return instance;
}

function storageManager(): StorageManager | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.storage;
}

async function isNearQuota(): Promise<boolean> {
  const storage = storageManager();
  if (storage === undefined || typeof storage.estimate !== "function") return false;
  try {
    const { usage, quota } = await storage.estimate();
    return usage !== undefined && quota !== undefined && quota > 0 && usage / quota > QUOTA_LIMIT;
  } catch {
    return false;
  }
}

export async function checkStorage(): Promise<StorageCheck> {
  if (typeof indexedDB === "undefined") return { ok: false, reason: "unavailable" };
  try {
    await getLocalDb().open();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (await isNearQuota()) return { ok: false, reason: "quota" };
  return { ok: true };
}

export async function requestPersist(): Promise<boolean> {
  const storage = storageManager();
  if (storage === undefined || typeof storage.persist !== "function") return false;
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}
