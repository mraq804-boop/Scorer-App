import type { MatchEvent } from "@/lib/scoring";

export type MergeResult = { events: MatchEvent[]; gap: boolean };

export function contiguousPrefix(events: readonly MatchEvent[]): MatchEvent[] {
  const end = events.findIndex((event, index) => event.seq !== index + 1);
  return events.slice(0, end === -1 ? events.length : end);
}

export function mergeEvents(current: readonly MatchEvent[], incoming: readonly MatchEvent[]): MergeResult {
  const byId = new Map<string, MatchEvent>();
  for (const event of [...current, ...incoming]) {
    if (!byId.has(event.id)) byId.set(event.id, event);
  }
  const events = [...byId.values()].sort((a, b) => a.seq - b.seq);
  return { events, gap: contiguousPrefix(events).length !== events.length };
}
