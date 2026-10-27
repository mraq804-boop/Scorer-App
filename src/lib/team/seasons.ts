import type { Season } from "./types";

function startsLater(candidate: Season, current: Season): boolean {
  if (candidate.startsOn !== current.startsOn) return candidate.startsOn > current.startsOn;
  return candidate.id < current.id;
}

export function seasonOf(playedAt: string, seasons: Season[], timeZone: string): string | null {
  const instant = new Date(playedAt);
  if (Number.isNaN(instant.getTime())) return null;

  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

  let chosen: Season | null = null;
  for (const season of seasons) {
    if (day < season.startsOn || day > season.endsOn) continue;
    if (chosen === null || startsLater(season, chosen)) chosen = season;
  }
  return chosen === null ? null : chosen.id;
}
