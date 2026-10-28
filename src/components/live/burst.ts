import type { CommentaryItem } from "@/lib/scoring";

export type Burst = "four" | "six" | "wicket";

export function burstFor(previous: CommentaryItem | undefined, next: CommentaryItem | undefined): Burst | null {
  if (previous === undefined || next === undefined || previous.eventId === next.eventId) return null;
  if (next.wicket !== null) return "wicket";
  if (next.boundary && next.runs === 6) return "six";
  return next.boundary && next.runs === 4 ? "four" : null;
}
