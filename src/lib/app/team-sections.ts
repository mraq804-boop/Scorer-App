export type TeamSection = "squad" | "fixtures" | "results" | "settings";

const OWNER_SECTIONS: readonly TeamSection[] = ["squad", "fixtures", "results", "settings"];
const SCORER_SECTIONS: readonly TeamSection[] = ["squad", "fixtures"];

export function sectionsFor(role: "owner" | "scorer"): TeamSection[] {
  return [...(role === "owner" ? OWNER_SECTIONS : SCORER_SECTIONS)];
}

export function sectionFromQuery(value: string | null, role: "owner" | "scorer"): TeamSection {
  return sectionsFor(role).find((section) => section === value) ?? "squad";
}
