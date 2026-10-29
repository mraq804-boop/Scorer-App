import { describe, expect, it } from "vitest";
import { sectionFromQuery, sectionsFor } from "@/lib/app/team-sections";

describe("My team sections", () => {
  it("an owner has four sections, a scorer two", () => {
    expect(sectionsFor("owner")).toEqual(["squad", "fixtures", "results", "settings"]);
    expect(sectionsFor("scorer")).toEqual(["squad", "fixtures"]);
  });

  it("a scorer can't open owner sections", () => {
    expect(sectionFromQuery("settings", "scorer")).toBe("squad");
    expect(sectionFromQuery("results", "scorer")).toBe("squad");
    expect(sectionFromQuery("fixtures", "scorer")).toBe("fixtures");
    expect(sectionFromQuery(null, "owner")).toBe("squad");
    expect(sectionFromQuery("bogus", "owner")).toBe("squad");
    expect(sectionFromQuery("settings", "owner")).toBe("settings");
  });
});
