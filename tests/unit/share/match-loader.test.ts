import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestMatch } from "../../helpers/match";

const getLiveMatch = vi.fn();

vi.mock("@/server/live", () => ({ getLiveMatch }));

const { loadSharedMatch } = await import("@/server/share/match");

const BASE = "https://proj.supabase.co/storage/v1/object/public/team-media";
const TEAM = {
  code: "lion2345",
  name: "Lions",
  colour: "ocean",
  logoVersion: 2,
  side: "A",
  potmPlayerId: "p-Ali",
  resultOverride: null,
  xi: ["p-Ali", "p-Usman"],
  photos: { "p-Ali": 3 },
};

function live(team: unknown) {
  const m = new TestMatch();
  m.ball({ runs: 4, boundary: true });
  return { match: { id: "m1", code: "abcd2345", title: "Lions v Tigers", team }, events: m.events };
}

beforeEach(() => {
  getLiveMatch.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("players/p-Ali-3.jpg") || url.endsWith("logo-2.jpg")) {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
      }
      throw new Error("offline");
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("loadSharedMatch", () => {
  it("has no brand for a plain match", async () => {
    getLiveMatch.mockResolvedValue(live(null));
    expect((await loadSharedMatch("abcd2345"))?.brand).toBeNull();
  });

  it("fills the brand of a team match with embedded pictures", async () => {
    getLiveMatch.mockResolvedValue(live(TEAM));
    const brand = (await loadSharedMatch("abcd2345"))?.brand;
    expect(brand).toMatchObject({
      side: "A",
      colour: "ocean",
      logoUrl: "data:image/jpeg;base64,AQID",
      potmPlayerId: "p-Ali",
      resultOverride: null,
      xi: ["p-Ali", "p-Usman"],
    });
    expect(brand?.photoUrlOf("p-Ali")).toBe("data:image/jpeg;base64,AQID");
    expect(brand?.photoUrlOf("p-Usman")).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(`${BASE}/teams/lion2345/logo-2.jpg`, expect.anything());
  });

  it("falls back to initials when a picture does not load", async () => {
    getLiveMatch.mockResolvedValue(live({ ...TEAM, logoVersion: 9, photos: { "p-Ali": 8 } }));
    const brand = (await loadSharedMatch("abcd2345"))?.brand;
    expect(brand?.logoUrl).toBeNull();
    expect(brand?.photoUrlOf("p-Ali")).toBeNull();
  });
});
