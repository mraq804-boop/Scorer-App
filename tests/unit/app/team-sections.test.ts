import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TeamSectionTabs } from "@/components/team/team-section-tabs";
import { nextSection, sectionFromQuery, sectionsFor } from "@/lib/app/team-sections";

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

describe("section tabs from the keyboard", () => {
  const all = sectionsFor("owner");

  it("arrows move along the tabs and wrap, Home and End jump to the ends", () => {
    expect(nextSection(all, "squad", "ArrowRight")).toBe("fixtures");
    expect(nextSection(all, "settings", "ArrowRight")).toBe("squad");
    expect(nextSection(all, "squad", "ArrowLeft")).toBe("settings");
    expect(nextSection(all, "results", "Home")).toBe("squad");
    expect(nextSection(all, "fixtures", "End")).toBe("settings");
    expect(nextSection(all, "squad", "Enter")).toBeNull();
  });

  it("only the selected tab is in the Tab order, and each points at the panel", () => {
    const html = renderToStaticMarkup(createElement(TeamSectionTabs, { sections: all, current: "fixtures", onSelect: () => undefined }));
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(3);
    expect(html).toContain('id="team-tab-fixtures"');
    expect(html).toContain('aria-controls="team-section-panel"');
  });
});

