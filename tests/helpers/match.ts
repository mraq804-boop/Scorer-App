import { defaultRules, deliveryDraft, replay } from "@/lib/scoring";
import type {
  BallInput,
  BatterLine,
  BowlerLine,
  CorrectionPatch,
  DeliveryEvent,
  EventDraft,
  InningsState,
  MatchEvent,
  MatchState,
  Rules,
  TeamSide,
} from "@/lib/scoring";

type Toss = { winner: TeamSide; choice: "bat" | "bowl" };

type TestMatchOptions = {
  rules?: Partial<Rules>;
  overs?: number;
  teams?: [string, string];
  toss?: Toss;
  openers?: [string, string];
  bowler?: string;
};

const UNDO_ANCHORS: ReadonlySet<MatchEvent["type"]> = new Set([
  "delivery",
  "retired",
  "innings_ended",
  "innings_started",
  "settings_changed",
]);
const NEVER_UNDONE: ReadonlySet<MatchEvent["type"]> = new Set(["match_created", "player_added", "undo", "correct"]);

function other(side: TeamSide): TeamSide {
  return side === "A" ? "B" : "A";
}

export class TestMatch {
  readonly events: MatchEvent[] = [];

  constructor(opts: TestMatchOptions = {}) {
    const [teamA, teamB] = opts.teams ?? ["Lions", "Tigers"];
    const toss: Toss = opts.toss ?? { winner: "A", choice: "bat" };
    const [striker, nonStriker] = opts.openers ?? ["Ali", "Usman"];
    const bowler = opts.bowler ?? "Hamza";
    const battingTeam = toss.choice === "bat" ? toss.winner : other(toss.winner);

    this.push({
      type: "match_created",
      title: `${teamA} v ${teamB}`,
      teams: { A: { name: teamA }, B: { name: teamB } },
      rules: { ...defaultRules("tape", opts.overs ?? 10), ...opts.rules },
      toss,
    });
    this.addPlayer(striker, battingTeam);
    this.addPlayer(nonStriker, battingTeam);
    this.addPlayer(bowler, other(battingTeam));
    this.push({
      type: "innings_started",
      innings: 1,
      battingTeam,
      striker: this.id(striker),
      nonStriker: this.id(nonStriker),
      bowler: this.id(bowler),
    });
  }

  get state(): MatchState {
    return replay(this.events);
  }

  get inn(): InningsState {
    const last = this.state.innings.at(-1);
    if (last === undefined) throw new Error("TestMatch has no innings");
    return last;
  }

  id(name: string): string {
    return `p-${name}`;
  }

  push(draft: EventDraft): MatchEvent {
    const seq = this.events.length + 1;
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString();
    const event: MatchEvent = { ...draft, id: `e${seq}`, seq, at };
    this.events.push(event);
    return event;
  }

  ball(input: BallInput): DeliveryEvent {
    return this.push(deliveryDraft(this.state, input)) as DeliveryEvent;
  }

  over(runs: number[]): DeliveryEvent[] {
    return runs.map((r) => this.ball({ runs: r }));
  }

  bowler(name: string): void {
    this.addPlayer(name, this.inn.bowlingTeam);
    this.push({ type: "bowler_changed", player: this.id(name) });
  }

  batter(name: string): void {
    this.addPlayer(name, this.inn.battingTeam);
    this.push({ type: "batter_in", player: this.id(name) });
  }

  undo(): void {
    this.push({ type: "undo", targets: this.undoTargets() });
  }

  correct(eventId: string, patch: CorrectionPatch): void {
    this.push({ type: "correct", target: eventId, patch });
  }

  endInnings(reason: "overs" | "all_out" | "target" | "manual"): void {
    this.push({ type: "innings_ended", innings: this.inn.number, reason });
  }

  startInnings2(openers: [string, string], bowler: string): void {
    const battingTeam = other(this.state.innings[0].battingTeam);
    this.addPlayer(openers[0], battingTeam);
    this.addPlayer(openers[1], battingTeam);
    this.addPlayer(bowler, other(battingTeam));
    this.push({
      type: "innings_started",
      innings: 2,
      battingTeam,
      striker: this.id(openers[0]),
      nonStriker: this.id(openers[1]),
      bowler: this.id(bowler),
    });
  }

  private addPlayer(name: string, team: TeamSide): void {
    const id = this.id(name);
    if (this.events.some((e) => e.type === "player_added" && e.player.id === id)) return;
    this.push({ type: "player_added", player: { id, name, team } });
  }

  private undoTargets(): string[] {
    const voided = new Set(this.events.flatMap((e) => (e.type === "undo" ? e.targets : [])));
    const live = this.events.filter((e) => !voided.has(e.id));
    const anchor = live.findLastIndex((e) => UNDO_ANCHORS.has(e.type));
    if (anchor < 0) return [];
    return live
      .slice(anchor)
      .filter((e) => !NEVER_UNDONE.has(e.type))
      .map((e) => e.id);
  }
}

export function batterLine(m: TestMatch, name: string): BatterLine {
  const line = m.inn.batting.find((l) => l.playerId === m.id(name));
  if (line === undefined) throw new Error(`no batting line for ${name}`);
  return line;
}

export function bowlerLine(m: TestMatch, name: string): BowlerLine {
  const line = m.inn.bowling.find((l) => l.playerId === m.id(name));
  if (line === undefined) throw new Error(`no bowling line for ${name}`);
  return line;
}
