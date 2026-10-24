import Dexie, { type Table } from "dexie";
import type { MatchEvent, Rules } from "@/lib/scoring";
import type { MatchSummary } from "@/lib/share/summary";

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
};

export type StoredEvent = MatchEvent & { matchId: string };

type MetaRow = { key: string; value: string };

export type StorageCheck = { ok: true } | { ok: false; reason: "unavailable" | "quota" };

const QUOTA_LIMIT = 0.95;

export class LocalDb extends Dexie {
  declare matches: Table<LocalMatch, string>;
  declare events: Table<StoredEvent, [string, number]>;
  declare meta: Table<MetaRow, string>;

  constructor(name = "cricket-scorer") {
    super(name);
    this.version(1).stores({
      matches: "id, code, updatedAt",
      events: "[matchId+seq], id, matchId",
      meta: "key",
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
