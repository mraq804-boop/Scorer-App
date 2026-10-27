import { describe, expect, it } from "vitest";
import { seasonOf } from "@/lib/team";
import type { Season } from "@/lib/team";

const winter: Season = { id: "winter", name: "Winter 2026", startsOn: "2025-10-01", endsOn: "2026-03-31" };
const summer: Season = { id: "summer", name: "Summer 2026", startsOn: "2026-04-01", endsOn: "2026-09-30" };

describe("seasonOf", () => {
  it("assigns seasons in the team time zone", () => {
    const playedAt = "2026-03-31T19:30:00Z";
    expect(seasonOf(playedAt, [winter, summer], "Asia/Karachi")).toBe("summer");
    expect(seasonOf(playedAt, [winter, summer], "UTC")).toBe("winter");
  });

  it("keeps a match played just before local midnight on the last day in that season", () => {
    expect(seasonOf("2026-03-31T18:59:59Z", [winter, summer], "Asia/Karachi")).toBe("winter");
  });

  it("uses the local day west of UTC too", () => {
    expect(seasonOf("2026-04-01T02:00:00Z", [winter, summer], "America/Los_Angeles")).toBe("winter");
  });

  it("includes both the first and the last day of a season", () => {
    expect(seasonOf("2025-10-01T00:00:00+05:00", [winter, summer], "Asia/Karachi")).toBe("winter");
    expect(seasonOf("2026-09-30T23:59:59+05:00", [winter, summer], "Asia/Karachi")).toBe("summer");
  });

  it("picks the season that started later when seasons overlap", () => {
    const cup: Season = { id: "cup", name: "Ramadan Cup", startsOn: "2026-05-01", endsOn: "2026-05-31" };
    expect(seasonOf("2026-05-10T10:00:00Z", [summer, cup], "Asia/Karachi")).toBe("cup");
    expect(seasonOf("2026-05-10T10:00:00Z", [cup, summer], "Asia/Karachi")).toBe("cup");
    expect(seasonOf("2026-06-10T10:00:00Z", [cup, summer], "Asia/Karachi")).toBe("summer");
  });

  it("is null outside every season", () => {
    expect(seasonOf("2027-01-01T10:00:00Z", [winter, summer], "Asia/Karachi")).toBeNull();
    expect(seasonOf("2026-04-01T10:00:00Z", [], "Asia/Karachi")).toBeNull();
  });

  it("is null for a time that cannot be read", () => {
    expect(seasonOf("not a date", [winter, summer], "Asia/Karachi")).toBeNull();
  });
});
