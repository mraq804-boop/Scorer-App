import { newMatchCode } from "@/lib/local/code";
import type { LocalDb, LocalMatch } from "@/lib/local/db";
import { getDeviceId, loadEvents } from "@/lib/local/matches";
import { replay } from "@/lib/scoring";
import type { MatchEvent } from "@/lib/scoring";
import type { PushFn, PushMatch } from "./push";

export type SyncOutcome = "synced" | "pending" | "blocked";

export type SyncOptions = { claim?: () => Promise<void> };

export type SyncLoopOptions = {
  db: LocalDb;
  push: PushFn;
  claim: () => Promise<void>;
  isReady: () => boolean | Promise<boolean>;
};

type Loop = { trigger: () => void; stop: () => void };

const BATCH_SIZE = 200;
const MAX_RESEND_ROUNDS = 3;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60000;
export const REFUSED_DELAY_MS = 15 * 60_000;
export const PENDING_CLAIM_KEY = "pendingClaim";

let activeLoop: Loop | undefined;
const refusedUntil = new Map<string, number>();

export function nextDelay(attempt: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
}

function isUnsynced(match: LocalMatch): boolean {
  return match.syncState !== "blocked" && match.syncedSeq < match.lastSeq;
}

function isHeldBack(matchId: string): boolean {
  return Date.now() < (refusedUntil.get(matchId) ?? 0);
}

async function claimSettled(db: LocalDb, claim: SyncOptions["claim"]): Promise<boolean> {
  if ((await db.meta.get(PENDING_CLAIM_KEY)) === undefined) return true;
  if (claim === undefined) return false;
  try {
    await claim();
    return true;
  } catch {
    return false;
  }
}

async function snapshot(db: LocalDb, matchId: string): Promise<{ match: LocalMatch; events: MatchEvent[] }> {
  return db.transaction("r", db.matches, db.events, async () => {
    const match = await db.matches.get(matchId);
    if (match === undefined) throw new Error(`Unknown match ${matchId}`);
    return { match, events: await loadEvents(db, matchId) };
  });
}

async function recordProgress(db: LocalDb, matchId: string, syncedSeq: number): Promise<LocalMatch["syncState"]> {
  return db.transaction("rw", db.matches, async () => {
    const current = await db.matches.get(matchId);
    if (current === undefined) throw new Error(`Unknown match ${matchId}`);
    const acked = Math.min(syncedSeq, current.lastSeq);
    const syncState =
      current.syncState === "blocked" ? "blocked" : current.lastSeq === acked ? "synced" : "pending";
    if (current.syncedSeq !== acked || current.syncState !== syncState) {
      await db.matches.update(matchId, { syncedSeq: acked, syncState });
    }
    return syncState;
  });
}

async function recordBlocked(
  db: LocalDb,
  matchId: string,
  blockedReason: NonNullable<LocalMatch["blockedReason"]>,
): Promise<void> {
  await db.transaction("rw", db.matches, async () => {
    await db.matches.update(matchId, { syncState: "blocked", blockedReason });
  });
}

function pushMatch(match: LocalMatch, events: MatchEvent[]): PushMatch {
  const state = replay(events);
  return {
    id: match.id,
    code: match.code,
    title: match.title,
    teamA: match.teams[0],
    teamB: match.teams[1],
    rules: state.rules,
    status: state.status === "complete" ? "complete" : "in_progress",
    summary: match.summary,
  };
}

async function pushPending(db: LocalDb, matchId: string, push: PushFn): Promise<SyncOutcome> {
  const device = await getDeviceId(db);
  let codeRetried = false;
  let resendRounds = 0;

  for (;;) {
    const { match, events } = await snapshot(db, matchId);
    if (match.syncState === "blocked") return "blocked";

    if (match.syncedSeq >= match.lastSeq) {
      const state = await recordProgress(db, matchId, match.lastSeq);
      if (state !== "pending") return state;
      continue;
    }

    const batch = events.filter((event) => event.seq > match.syncedSeq).slice(0, BATCH_SIZE);
    const target = batch.at(-1)?.seq ?? match.lastSeq;
    const result = await push({ match: pushMatch(match, events), device, events: batch });

    if (!result.ok) {
      if (result.error === "scoring_moved" || result.error === "not_owner") {
        await recordBlocked(db, matchId, result.error);
        return "blocked";
      }
      if (result.error === "code_taken" && !codeRetried) {
        codeRetried = true;
        await db.matches.update(matchId, { code: newMatchCode() });
        continue;
      }
      if (result.error === "unknown") refusedUntil.set(matchId, Date.now() + REFUSED_DELAY_MS);
      return "pending";
    }

    refusedUntil.delete(matchId);
    await recordProgress(db, matchId, Math.min(result.lastSeq, match.lastSeq));
    if (result.lastSeq < target) {
      resendRounds += 1;
      if (resendRounds > MAX_RESEND_ROUNDS) return "pending";
    }
  }
}

export async function syncMatch(
  db: LocalDb,
  matchId: string,
  push: PushFn,
  opts: SyncOptions = {},
): Promise<SyncOutcome> {
  if (!(await claimSettled(db, opts.claim))) return "pending";
  return pushPending(db, matchId, push);
}

export async function syncAll(
  db: LocalDb,
  push: PushFn,
  opts: SyncOptions,
): Promise<Exclude<SyncOutcome, "blocked">> {
  if (!(await claimSettled(db, opts.claim))) return "pending";
  const matches = await db.matches.orderBy("updatedAt").reverse().toArray();
  let outcome: Exclude<SyncOutcome, "blocked"> = "synced";
  for (const match of matches) {
    if (!isUnsynced(match)) continue;
    if (isHeldBack(match.id) || (await pushPending(db, match.id, push)) === "pending") outcome = "pending";
  }
  return outcome;
}

async function hasUnsyncedMatches(db: LocalDb): Promise<boolean> {
  return (await db.matches.filter(isUnsynced).count()) > 0;
}

export function requestSync(): void {
  activeLoop?.trigger();
}

export function startSyncLoop({ db, push, claim, isReady }: SyncLoopOptions): () => void {
  activeLoop?.stop();

  let stopped = false;
  let running = false;
  let again = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancelTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  async function attemptPass(): Promise<boolean> {
    if (!(await isReady())) return !(await hasUnsyncedMatches(db));
    if (stopped) return true;
    return (await syncAll(db, push, { claim })) === "synced";
  }

  async function pass(): Promise<void> {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    cancelTimer();
    let done = false;
    try {
      done = await attemptPass();
    } catch {
      done = false;
    }
    running = false;
    if (stopped) return;
    if (done) {
      attempt = 0;
    } else {
      timer = setTimeout(() => void pass(), nextDelay(attempt));
      attempt += 1;
    }
    if (again) {
      again = false;
      void pass();
    }
  }

  const onOnline = () => void pass();
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void pass();
  };

  if (typeof window !== "undefined") window.addEventListener("online", onOnline);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);

  const loop: Loop = {
    trigger: () => void pass(),
    stop: () => {
      if (stopped) return;
      stopped = true;
      cancelTimer();
      if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
      activeLoop = undefined;
    },
  };

  activeLoop = loop;
  void pass();
  return loop.stop;
}
