import { liveQuery } from "dexie";
import type { LocalDb } from "@/lib/local/db";
import { requestSync } from "./sync";

export const SYNC_WAIT_MS = 5000;

export function flushSync(db: LocalDb, matchId: string, timeoutMs = SYNC_WAIT_MS): Promise<boolean> {
  requestSync();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (synced: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      resolve(synced);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const subscription = liveQuery(() => db.matches.get(matchId)).subscribe({
      next: (match) => {
        if (match === undefined || match.syncState === "blocked") finish(false);
        else if (match.syncedSeq >= match.lastSeq) finish(true);
      },
      error: () => finish(false),
    });
  });
}
