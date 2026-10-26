import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();

vi.mock("@/server/supabase/public", () => ({ createSupabasePublic: () => ({ rpc }) }));

const { getLiveEvents, getLiveMatch } = await import("@/server/live");

const HEADER = {
  id: "0b1c2d3e-0000-4000-8000-000000000001",
  code: "abcd2345",
  title: "Lions v Tigers",
  teamA: "Lions",
  teamB: "Tigers",
  status: "in_progress",
  updatedAt: "2026-10-23T10:00:00.000Z",
};

beforeEach(() => {
  rpc.mockReset();
});

describe("getLiveMatch", () => {
  it("calls get_live_match with the code and returns the match with its events", async () => {
    rpc.mockResolvedValue({ data: { match: HEADER, events: [{ id: "e1", seq: 1 }] }, error: null });

    expect(await getLiveMatch("abcd2345")).toEqual({ match: HEADER, events: [{ id: "e1", seq: 1 }] });
    expect(rpc).toHaveBeenCalledWith("get_live_match", { p_code: "abcd2345" });
  });

  it("returns null for an unknown or private match", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    expect(await getLiveMatch("abcd2345")).toBeNull();
  });

  it("throws when the call fails or returns an unexpected shape", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
    await expect(getLiveMatch("abcd2345")).rejects.toThrow("get_live_match failed: fetch failed");

    rpc.mockResolvedValueOnce({ data: { match: HEADER }, error: null });
    await expect(getLiveMatch("abcd2345")).rejects.toThrow("unexpected shape");
  });
});

describe("getLiveEvents", () => {
  it("calls get_live_events with the code and the seq to start after", async () => {
    rpc.mockResolvedValue({ data: [{ id: "e3", seq: 3 }], error: null });

    expect(await getLiveEvents("abcd2345", 2)).toEqual([{ id: "e3", seq: 3 }]);
    expect(rpc).toHaveBeenCalledWith("get_live_events", { p_code: "abcd2345", p_after: 2 });
  });

  it("throws when the call fails or does not return a list", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(getLiveEvents("abcd2345", 0)).rejects.toThrow("get_live_events failed: boom");

    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(getLiveEvents("abcd2345", 0)).rejects.toThrow("unexpected shape");
  });
});
