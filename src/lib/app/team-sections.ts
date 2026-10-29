export type TeamSection = "squad" | "fixtures" | "results" | "settings";

const OWNER_SECTIONS: readonly TeamSection[] = ["squad", "fixtures", "results", "settings"];
const SCORER_SECTIONS: readonly TeamSection[] = ["squad", "fixtures"];

export function sectionsFor(role: "owner" | "scorer"): TeamSection[] {
  return [...(role === "owner" ? OWNER_SECTIONS : SCORER_SECTIONS)];
}

export function sectionFromQuery(value: string | null, role: "owner" | "scorer"): TeamSection {
  return sectionsFor(role).find((section) => section === value) ?? "squad";
}

export function nextSection(sections: readonly TeamSection[], current: TeamSection, key: string): TeamSection | null {
  const index = sections.indexOf(current);
  if (key === "ArrowRight") return sections[(index + 1) % sections.length];
  if (key === "ArrowLeft") return sections[(index - 1 + sections.length) % sections.length];
  if (key === "Home") return sections[0];
  if (key === "End") return sections[sections.length - 1];
  return null;
}
