import { availableDismissals } from "@/lib/scoring";
import type {
  AvailableDismissal,
  BallKind,
  CommentaryItem,
  CorrectionPatch,
  DeliveryEvent,
  DismissalKind,
  InningsState,
  MatchEvent,
  MatchState,
  Rules,
  RunsAs,
} from "@/lib/scoring";

export type BallFields = {
  kind: BallKind;
  runs: number;
  runsAs: RunsAs;
  boundary: boolean;
  wicketKind: DismissalKind | null;
  fielder: string;
};

export type EditableBall = { event: DeliveryEvent; item: CommentaryItem; innings: InningsState };

export const WITH_FIELDER: ReadonlySet<AvailableDismissal> = new Set(["caught", "run_out", "stumped"]);
const NON_STRIKER_OUT: ReadonlySet<AvailableDismissal> = new Set(["run_out", "other"]);

export function isBoundaryRuns(runs: number): boolean {
  return runs === 4 || runs === 6;
}

export function fieldsOf(item: CommentaryItem): BallFields {
  return {
    kind: item.kind,
    runs: item.runs,
    runsAs: item.runsAs,
    boundary: item.boundary,
    wicketKind: item.wicket?.kind ?? null,
    fielder: item.wicket?.fielderName ?? "",
  };
}

export function setKind(fields: BallFields, kind: BallKind): BallFields {
  return { ...fields, kind, runsAs: kind === "wide" ? "bat" : fields.runsAs };
}

export function setRuns(fields: BallFields, runs: number): BallFields {
  return { ...fields, runs, boundary: isBoundaryRuns(runs) };
}

function penaltyOf(kind: BallKind, rules: Rules): number {
  if (kind === "wide") return rules.wideRuns;
  if (kind === "noball") return rules.noBallRuns;
  return 0;
}

function fielderFor(fields: BallFields): string | null {
  const name = fields.fielder.trim();
  const named = fields.wicketKind !== null && WITH_FIELDER.has(fields.wicketKind);
  return named && name !== "" ? name : null;
}

export function buildPatch(fields: BallFields, rules: Rules): CorrectionPatch {
  const patch: CorrectionPatch = {
    kind: fields.kind,
    runs: fields.runs,
    runsAs: fields.kind === "wide" ? "bat" : fields.runsAs,
    boundary: isBoundaryRuns(fields.runs) && fields.boundary,
    penalty: penaltyOf(fields.kind, rules),
  };
  if (fields.wicketKind !== null) patch.wicket = { kind: fields.wicketKind, fielderName: fielderFor(fields) };
  return patch;
}

export function isUnchanged(patch: CorrectionPatch, item: CommentaryItem): boolean {
  return (
    patch.kind === item.kind &&
    patch.runs === item.runs &&
    patch.runsAs === item.runsAs &&
    patch.boundary === item.boundary &&
    patch.penalty === item.penalty &&
    patch.wicket?.kind === item.wicket?.kind &&
    patch.wicket?.fielderName === item.wicket?.fielderName
  );
}

export function wicketOptions(state: MatchState, ball: EditableBall, kind: BallKind): DismissalKind[] {
  const asBowled: MatchState = {
    ...state,
    innings: [{ ...ball.innings, ended: null, freeHit: ball.item.freeHit }],
  };
  const nonStrikerOut = ball.event.wicket !== null && ball.event.wicket.playerOut !== ball.event.striker;
  return availableDismissals(asBowled, kind).filter(
    (option): option is DismissalKind =>
      option !== "retired_hurt" && option !== "retired_out" && (!nonStrikerOut || NON_STRIKER_OUT.has(option)),
  );
}

export function findBall(events: readonly MatchEvent[], state: MatchState, eventId: string): EditableBall | null {
  const event = events.find((candidate): candidate is DeliveryEvent => candidate.type === "delivery" && candidate.id === eventId);
  if (event === undefined) return null;
  for (const innings of state.innings) {
    const item = innings.commentary.find((candidate) => candidate.eventId === eventId);
    if (item !== undefined) return { event, item, innings };
  }
  return null;
}
