import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { availableDismissals, canCorrect, currentInnings, nextPrompt, replay } from "@/lib/scoring";
import type {
  BallInput,
  BallKind,
  CorrectionPatch,
  DeliveryEvent,
  DismissalKind,
  MatchEvent,
  Rules,
  RunsAs,
} from "@/lib/scoring";
import { TestMatch } from "../../helpers/match";

const NUM_RUNS = 150;
const PROPERTY = { timeout: 30_000 };
const MAX_BALLS = 150;
const WICKET_PERCENT = 5;
const MAX_PROMPT_STEPS = 20;
const BOWLER_POOL = 3;

type Setup = { overs: number; rules: Partial<Rules> };
type Step = {
  runs: number;
  kind: BallKind;
  runsAs: RunsAs;
  boundary: boolean;
  wicketRoll: number;
  wicketPick: number;
  nonStrikerOut: boolean;
  fielderName: string | null;
};

const ballKindArb = fc.oneof(
  { weight: 8, arbitrary: fc.constant<BallKind>("legal") },
  { weight: 1, arbitrary: fc.constant<BallKind>("wide") },
  { weight: 1, arbitrary: fc.constant<BallKind>("noball") },
);
const runsAsArb = fc.constantFrom<RunsAs>("bat", "bye", "legbye");
const dismissalKindArb = fc.constantFrom<DismissalKind>(
  "bowled",
  "caught",
  "lbw",
  "run_out",
  "stumped",
  "hit_wicket",
  "other",
);
const fielderArb = fc.constantFrom<string | null>(null, "Zain", "Bilal");

const setupArb: fc.Arbitrary<Setup> = fc.record({
  overs: fc.integer({ min: 1, max: 8 }),
  rules: fc.record({
    ballsPerOver: fc.constantFrom<6 | 8>(6, 8),
    playersPerSide: fc.record({ A: fc.integer({ min: 2, max: 11 }), B: fc.integer({ min: 2, max: 11 }) }),
    wideRuns: fc.integer({ min: 0, max: 2 }),
    wideRebowled: fc.boolean(),
    noBallRuns: fc.integer({ min: 0, max: 2 }),
    freeHit: fc.boolean(),
    lbw: fc.boolean(),
    lastManStands: fc.boolean(),
  }),
});

const stepArb: fc.Arbitrary<Step> = fc.record({
  runs: fc.integer({ min: 0, max: 6 }),
  kind: ballKindArb,
  runsAs: runsAsArb,
  boundary: fc.boolean(),
  wicketRoll: fc.integer({ min: 0, max: 99 }),
  wicketPick: fc.nat(),
  nonStrikerOut: fc.boolean(),
  fielderName: fielderArb,
});

const scriptArb = fc.array(stepArb, { maxLength: MAX_BALLS, size: "max" });

const patchArb: fc.Arbitrary<CorrectionPatch> = fc.record(
  {
    kind: ballKindArb,
    runs: fc.integer({ min: 0, max: 9 }),
    runsAs: runsAsArb,
    boundary: fc.boolean(),
    penalty: fc.integer({ min: 0, max: 5 }),
    wicket: fc.record({ kind: dismissalKindArb, fielderName: fielderArb }),
  },
  { requiredKeys: [] },
);

function resolvePrompts(m: TestMatch): void {
  for (let i = 0; i < MAX_PROMPT_STEPS; i++) {
    const prompt = nextPrompt(m.state);
    if (prompt === null) return;
    switch (prompt.kind) {
      case "choose_batter":
        m.batter(`bat${m.events.length}`);
        break;
      case "choose_bowler": {
        const { number, legalBalls } = m.inn;
        const over = Math.floor(legalBalls / m.state.rules.ballsPerOver);
        m.bowler(`bow${number}-${over % BOWLER_POOL}`);
        break;
      }
      case "all_out":
        m.endInnings("all_out");
        break;
      case "innings_over":
        m.endInnings(prompt.reason);
        break;
      case "start_innings":
        m.startInnings2([`open${m.events.length}a`, `open${m.events.length}b`], "bow2-0");
        break;
    }
  }
  throw new Error("prompt was not resolved");
}

function applyStep(m: TestMatch, step: Step): void {
  const state = m.state;
  const innings = currentInnings(state);
  if (innings === null || innings.striker === null) throw new Error("no batter at the crease");
  const input: BallInput = { runs: step.runs, kind: step.kind, runsAs: step.runsAs, boundary: step.boundary };
  if (step.wicketRoll >= WICKET_PERCENT) {
    m.ball(input);
    return;
  }

  const options = availableDismissals(state, step.kind);
  const choice = options[step.wicketPick % options.length];
  if (choice === "retired_hurt" || choice === "retired_out") {
    m.push({ type: "retired", player: innings.striker, how: choice === "retired_hurt" ? "hurt" : "out" });
    return;
  }
  const playerOut = choice === "run_out" && step.nonStrikerOut ? innings.nonStriker : null;
  m.ball({
    ...input,
    wicket: { kind: choice, playerOut: playerOut ?? undefined, fielderName: step.fielderName },
  });
}

function play(setup: Setup, script: readonly Step[]): TestMatch {
  const m = new TestMatch({ overs: setup.overs, rules: setup.rules });
  for (const step of script) {
    resolvePrompts(m);
    if (m.state.status === "complete") break;
    applyStep(m, step);
  }
  return m;
}

function patchedDelivery(event: DeliveryEvent, patch: CorrectionPatch): DeliveryEvent {
  const next: DeliveryEvent = { ...event };
  if (patch.kind !== undefined) next.kind = patch.kind;
  if (patch.runs !== undefined) next.runs = patch.runs;
  if (patch.runsAs !== undefined) next.runsAs = patch.runsAs;
  if (patch.boundary !== undefined) next.boundary = patch.boundary;
  if (patch.penalty !== undefined) next.penalty = patch.penalty;
  if (patch.wicket !== undefined && event.wicket !== null) next.wicket = { ...event.wicket, ...patch.wicket };
  return next;
}

function validPatch(event: DeliveryEvent, generated: CorrectionPatch): CorrectionPatch {
  const patch = { ...generated };
  if (event.wicket === null) delete patch.wicket;
  return patch;
}

function isDelivery(event: MatchEvent): event is DeliveryEvent {
  return event.type === "delivery";
}

describe("engine properties", () => {
  it("accounts every run to a batter or an extra", PROPERTY, () => {
    fc.assert(
      fc.property(setupArb, scriptArb, (setup, script) => {
        for (const innings of play(setup, script).state.innings) {
          const { wides, noBalls, byes, legByes } = innings.extras;
          const batted = innings.batting.reduce((sum, line) => sum + line.runs, 0);
          expect(innings.runs).toBe(batted + wides + noBalls + byes + legByes);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("never bowls past the overs limit", PROPERTY, () => {
    fc.assert(
      fc.property(setupArb, scriptArb, (setup, script) => {
        const { innings, rules } = play(setup, script).state;
        for (const inn of innings) {
          expect(inn.legalBalls).toBeLessThanOrEqual(rules.oversPerInnings * rules.ballsPerOver);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("replays to the same state whatever order the events arrive in", PROPERTY, () => {
    const shuffledArb = fc.tuple(setupArb, scriptArb).chain(([setup, script]) => {
      const { events } = play(setup, script);
      return fc
        .shuffledSubarray(events, { minLength: events.length, maxLength: events.length })
        .map((shuffled) => ({ events, shuffled }));
    });
    fc.assert(
      fc.property(shuffledArb, ({ events, shuffled }) => {
        expect(replay(shuffled)).toEqual(replay(events));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("restores the previous state when the last ball is undone", PROPERTY, () => {
    fc.assert(
      fc.property(setupArb, scriptArb, stepArb, (setup, script, next) => {
        const m = play(setup, script);
        resolvePrompts(m);
        fc.pre(m.state.status !== "complete");
        const before = m.state;
        applyStep(m, next);
        m.undo();
        expect(m.state).toEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("corrects a past ball exactly as if it had been scored that way", PROPERTY, () => {
    fc.assert(
      fc.property(setupArb, scriptArb, fc.nat(), patchArb, patchArb, (setup, script, pick, earlier, latest) => {
        const m = play(setup, script);
        const deliveries = m.events.filter(isDelivery);
        fc.pre(deliveries.length > 0);
        const target = deliveries[pick % deliveries.length];
        const firstPatch = validPatch(target, earlier);
        const finalPatch = validPatch(target, latest);
        expect(canCorrect(target, firstPatch)).toBe(true);
        expect(canCorrect(target, finalPatch)).toBe(true);

        m.correct(target.id, firstPatch);
        m.correct(target.id, finalPatch);

        const reference = m.events
          .filter((event) => event.type !== "correct")
          .map((event) => (event.id === target.id ? patchedDelivery(target, finalPatch) : event));
        expect(m.state).toEqual(replay(reference));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
