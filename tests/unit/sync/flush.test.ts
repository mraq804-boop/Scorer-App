import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultRules } from "@/lib/scoring";
import { LocalDb } from "@/lib/local/db";
import { createLocalMatch } from "@/lib/local/matches";
import { flushSync } from "@/lib/sync/flush";
import { requestSync } from "@/lib/sync/sync";

vi.mock("@/lib/sync/sync", () => ({ requestSync: vi.fn() }));

const opened: LocalDb[] = [];

async function pendingMatch() {
  const db = new LocalDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  const match = await createLocalMatch(db, {
    teams: ["Lions", "Tigers"],
    rules: defaultRules("tape", 10),
    toss: { winner: "A", choice: "bat" },
    striker: "Ali",
    nonStriker: "Usman",
    bowler: "Hamza",
  });
  return { db, match };
}

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  vi.mocked(requestSync).mockClear();
});

describe("flushSync", () => {
  it("asks the sync loop to run", async () => {
    const { db, match } = await pendingMatch();
    await flushSync(db, match.id, 10);
    expect(requestSync).toHaveBeenCalledTimes(1);
  });

  it("resolves true at once when everything is already synced", async () => {
    const { db, match } = await pendingMatch();
    await db.matches.update(match.id, { syncedSeq: match.lastSeq, syncState: "synced" });
    expect(await flushSync(db, match.id, 60_000)).toBe(true);
  });

  it("resolves true as soon as the last ball is acknowledged", async () => {
    const { db, match } = await pendingMatch();
    await db.matches.update(match.id, { lastSeq: 7, syncedSeq: 3 });
    const flushed = flushSync(db, match.id, 60_000);

    await db.matches.update(match.id, { syncedSeq: 6 });
    await db.matches.update(match.id, { syncedSeq: 7, syncState: "synced" });

    expect(await flushed).toBe(true);
  });

  it("gives up after the timeout and leaves the caller to carry on", async () => {
    const { db, match } = await pendingMatch();
    await db.matches.update(match.id, { lastSeq: 7, syncedSeq: 3 });
    const started = Date.now();

    expect(await flushSync(db, match.id, 50)).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });

  it("does not wait when scoring moved to another phone", async () => {
    const { db, match } = await pendingMatch();
    await db.matches.update(match.id, { lastSeq: 7, syncedSeq: 3, syncState: "blocked", blockedReason: "scoring_moved" });
    const started = Date.now();

    expect(await flushSync(db, match.id, 60_000)).toBe(false);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("does not wait for a match that is not stored", async () => {
    const { db } = await pendingMatch();
    expect(await flushSync(db, "missing", 60_000)).toBe(false);
  });
});
