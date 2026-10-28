import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COLOUR_KEYS,
  colourFor,
  initials,
  isColourKey,
  logoPath,
  logoUrl,
  nextPictureVersion,
  photoPath,
  photoUrl,
} from "@/lib/brand";
import { INK } from "@/lib/brand-mark";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("team colours", () => {
  it("uses the team's chosen colour", () => {
    expect(colourFor("ocean", "Lions").key).toBe("ocean");
  });

  it("falls back to a hashed colour and initials", () => {
    expect(colourFor(null, "Kites")).toEqual(colourFor("bogus", "  KITES "));
    expect(COLOUR_KEYS).toContain(colourFor(undefined, "Kites").key);
    expect(initials("Lions Cricket Club")).toBe("LC");
    expect(initials("  kites ")).toBe("K");
    expect(initials("بلال احمد")).toBe("با");
    expect(initials("")).toBe("?");
  });

  it("gives different teams different colours often enough to tell them apart", () => {
    const keys = new Set(["Lions", "Kites", "Hawks", "Tigers", "Eagles", "Falcons"].map((name) => colourFor(null, name).key));
    expect(keys.size).toBeGreaterThanOrEqual(3);
  });

  it("has ten colours, each with readable text", () => {
    expect(COLOUR_KEYS).toHaveLength(10);
    for (const key of COLOUR_KEYS) {
      expect(isColourKey(key)).toBe(true);
      expect(["#ffffff", INK]).toContain(colourFor(key, "x").on);
    }
    expect(isColourKey("gold")).toBe(false);
    expect(isColourKey(7)).toBe(false);
  });
});

describe("media paths", () => {
  it("names pictures by team code and version", () => {
    expect(logoPath("abcd2345", 3)).toBe("teams/abcd2345/logo-3.jpg");
    expect(photoPath("abcd2345", "p-1", 2)).toBe("teams/abcd2345/players/p-1-2.jpg");
  });

  it("builds public URLs only when a picture exists", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co/");
    expect(logoUrl("abcd2345", 3)).toBe("https://ref.supabase.co/storage/v1/object/public/team-media/teams/abcd2345/logo-3.jpg");
    expect(photoUrl("abcd2345", "p-1", 1)).toBe("https://ref.supabase.co/storage/v1/object/public/team-media/teams/abcd2345/players/p-1-1.jpg");
    expect(logoUrl("abcd2345", null)).toBeNull();
    expect(photoUrl("abcd2345", "p-1", undefined)).toBeNull();
  });
});

describe("nextPictureVersion", () => {
  const now = Date.UTC(2026, 9, 28, 12, 0, 0);
  const secondsSince2026 = Math.floor((now - Date.UTC(2026, 0, 1)) / 1000);

  it("never reuses the number of a removed picture", () => {
    expect(nextPictureVersion(null, now)).toBe(secondsSince2026);
    expect(nextPictureVersion(undefined, now)).toBe(secondsSince2026);
  });

  it("moves past the current picture even when the clock is behind it", () => {
    expect(nextPictureVersion(secondsSince2026 + 50, now)).toBe(secondsSince2026 + 51);
    expect(nextPictureVersion(3, now)).toBe(secondsSince2026);
  });

  it("gives a fresh number for each retry a second apart", () => {
    expect(nextPictureVersion(null, now + 1000)).toBe(nextPictureVersion(null, now) + 1);
  });

  it("stays inside a database int for decades", () => {
    expect(nextPictureVersion(null, Date.UTC(2090, 0, 1))).toBeLessThan(2 ** 31);
  });
});
