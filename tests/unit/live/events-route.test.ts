import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchEvent } from "@/lib/scoring";

vi.mock("server-only", () => ({}));
vi.stubEnv("LIVE_CACHE_SECONDS", "3");

const getLiveEvents = vi.fn<(code: string, after: number) => Promise<MatchEvent[]>>();
const getLiveMatch = vi.fn<(code: string) => Promise<unknown>>();

vi.mock("@/server/live", () => ({ getLiveEvents, getLiveMatch }));

const { GET } = await import("@/app/api/m/[code]/events/route");

const CODE = "abcd2345";

function event(seq: number): MatchEvent {
  return { id: `e${seq}`, seq, at: "2026-10-23T10:00:00.000Z", type: "strike_swapped" };
}

function call(code: string, query = "") {
  return GET(new NextRequest(`http://localhost:3200/api/m/${code}/events${query}`), {
    params: Promise.resolve({ code }),
  });
}

beforeEach(() => {
  getLiveEvents.mockReset();
  getLiveMatch.mockReset();
});

describe("GET /api/m/[code]/events", () => {
  it("returns the events after a seq with the cache headers", async () => {
    getLiveEvents.mockResolvedValue([event(3), event(4)]);

    const response = await call(CODE, "?after=2");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ events: [event(3), event(4)] });
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=3, stale-while-revalidate=10");
    expect(getLiveEvents).toHaveBeenCalledWith(CODE, 2);
  });

  it("treats a missing after as 0", async () => {
    getLiveEvents.mockResolvedValue([event(1)]);

    const response = await call(CODE);

    expect(response.status).toBe(200);
    expect(getLiveEvents).toHaveBeenCalledWith(CODE, 0);
  });

  it("returns 404 for an unknown or private code when nothing comes back from seq 0", async () => {
    getLiveEvents.mockResolvedValue([]);
    getLiveMatch.mockResolvedValue(null);

    const response = await call(CODE, "?after=0");

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control") ?? "").not.toContain("s-maxage");
    expect(getLiveMatch).toHaveBeenCalledWith(CODE);
  });

  it("returns an empty list for a known match that has no events yet", async () => {
    getLiveEvents.mockResolvedValue([]);
    getLiveMatch.mockResolvedValue({ match: { id: "m" }, events: [] });

    const response = await call(CODE, "?after=0");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ events: [] });
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=3, stale-while-revalidate=10");
  });

  it("returns an empty list without checking the match when the viewer is already up to date", async () => {
    getLiveEvents.mockResolvedValue([]);

    const response = await call(CODE, "?after=7");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ events: [] });
    expect(getLiveMatch).not.toHaveBeenCalled();
  });

  it.each(["-1", "1.5", "abc", "", "1e3", "2147483648", "0x10"])("rejects after=%s with 400", async (after) => {
    const response = await call(CODE, `?after=${after}`);

    expect(response.status).toBe(400);
    expect(getLiveEvents).not.toHaveBeenCalled();
  });

  it.each(["short", "ABCD2345", "abcd234i", "abcd23456", "abcd234!"])(
    "returns 404 for the malformed code %s without touching the database",
    async (code) => {
      const response = await call(code, "?after=0");

      expect(response.status).toBe(404);
      expect(getLiveEvents).not.toHaveBeenCalled();
      expect(getLiveMatch).not.toHaveBeenCalled();
    },
  );
});
