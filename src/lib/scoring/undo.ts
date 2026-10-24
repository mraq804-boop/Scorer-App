import type { CorrectionPatch, DeliveryEvent, MatchEvent } from "./types";

const UNDO_ANCHORS: ReadonlySet<MatchEvent["type"]> = new Set([
  "delivery",
  "retired",
  "innings_ended",
  "innings_started",
  "settings_changed",
]);
const NEVER_UNDONE: ReadonlySet<MatchEvent["type"]> = new Set(["match_created", "player_added", "undo", "correct"]);
const MAX_RUNS = 9;
const MAX_PENALTY = 5;

function bySeq(events: readonly MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => a.seq - b.seq);
}

function isMeta(event: MatchEvent): boolean {
  return event.type === "undo" || event.type === "correct";
}

function voidedIds(sorted: readonly MatchEvent[]): Set<string> {
  const targetable = new Set(sorted.filter((event) => !isMeta(event)).map((event) => event.id));
  const voided = new Set<string>();
  for (const event of sorted) {
    if (event.type !== "undo") continue;
    for (const id of event.targets) if (targetable.has(id)) voided.add(id);
  }
  return voided;
}

function latestPatches(sorted: readonly MatchEvent[]): Map<string, CorrectionPatch> {
  const patches = new Map<string, CorrectionPatch>();
  for (const event of sorted) if (event.type === "correct") patches.set(event.target, event.patch);
  return patches;
}

function corrected(event: DeliveryEvent, patch: CorrectionPatch): DeliveryEvent {
  return {
    ...event,
    kind: patch.kind ?? event.kind,
    runs: patch.runs ?? event.runs,
    runsAs: patch.runsAs ?? event.runsAs,
    boundary: patch.boundary ?? event.boundary,
    penalty: patch.penalty ?? event.penalty,
    wicket:
      event.wicket !== null && patch.wicket
        ? { ...event.wicket, kind: patch.wicket.kind, fielderName: patch.wicket.fielderName }
        : event.wicket,
  };
}

export function effectiveEvents(events: readonly MatchEvent[]): MatchEvent[] {
  const sorted = bySeq(events);
  const voided = voidedIds(sorted);
  const patches = latestPatches(sorted);
  const effective: MatchEvent[] = [];
  for (const event of sorted) {
    if (voided.has(event.id) || isMeta(event)) continue;
    const patch = event.type === "delivery" ? patches.get(event.id) : undefined;
    effective.push(event.type === "delivery" && patch !== undefined ? corrected(event, patch) : event);
  }
  return effective;
}

export function undoTargets(events: readonly MatchEvent[]): string[] {
  const sorted = bySeq(events);
  const voided = voidedIds(sorted);
  const live = sorted.filter((event) => !voided.has(event.id));
  const anchor = live.findLastIndex((event) => UNDO_ANCHORS.has(event.type));
  if (anchor < 0) return [];
  return live
    .slice(anchor)
    .filter((event) => !NEVER_UNDONE.has(event.type))
    .map((event) => event.id);
}

function withinRange(value: number | undefined, max: number): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0 && value <= max);
}

export function canCorrect(event: MatchEvent, patch: CorrectionPatch): boolean {
  if (event.type !== "delivery") return false;
  const patchedWicket: unknown = patch.wicket;
  if (patchedWicket === null) return false;
  if (patchedWicket !== undefined && event.wicket === null) return false;
  return withinRange(patch.runs, MAX_RUNS) && withinRange(patch.penalty, MAX_PENALTY);
}
