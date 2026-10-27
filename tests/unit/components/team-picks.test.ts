import { describe, expect, it } from "vitest";
import { buildPatch, fieldsOf, findBall, isUnchanged } from "@/components/scoring/ball-patch";
import type { BallFields, EditableBall } from "@/components/scoring/ball-patch";
import { chooseTypedPlayer, choosePlayer, fielderOptions, xiFor } from "@/components/scoring/player-drafts";
import type { MatchTeam } from "@/components/scoring/player-drafts";
import { defaultRules } from "@/lib/scoring";
import type { DeliveryEvent } from "@/lib/scoring";
import { TestMatch } from "../../helpers/match";

const rules = defaultRules("tape", 10);

const BILAL = { id: "squad-bilal", name: "Bilal" };
const FAISAL = { id: "squad-faisal", name: "Faisal" };
const ZAIN = { id: "squad-zain", name: "Zain" };

function teamOf(...xi: { id: string; name: string }[]): MatchTeam {
  return { id: "team-1", side: "A", fixtureId: null, xi };
}

function caught(overrides: Partial<BallFields> = {}): BallFields {
  return {
    kind: "legal",
    runs: 0,
    runsAs: "bat",
    boundary: false,
    wicketKind: "caught",
    fielder: "",
    fielderId: null,
    ...overrides,
  };
}

function editable(m: TestMatch, event: DeliveryEvent): EditableBall {
  const ball = findBall(m.events, m.state, event.id);
  if (ball === null) throw new Error("ball not found");
  return ball;
}

describe("choosePlayer with a squad id", () => {
  it("adds the player under the squad id", () => {
    const m = new TestMatch();
    const choice = choosePlayer(m.state, "A", "  Bilal ", BILAL.id);
    expect(choice).toEqual({
      id: BILAL.id,
      drafts: [{ type: "player_added", player: { id: BILAL.id, name: "Bilal", team: "A" } }],
    });
  });

  it("reuses the player already in the match under that id", () => {
    const m = new TestMatch();
    expect(choosePlayer(m.state, "A", "Ali", m.id("Ali"))).toEqual({ id: m.id("Ali"), drafts: [] });
  });

  it("reuses that player even when the caller would not reuse a player by name", () => {
    const m = new TestMatch();
    expect(choosePlayer(m.state, "A", "Ali", m.id("Ali"), () => false)).toEqual({ id: m.id("Ali"), drafts: [] });
  });

  it("keeps a same-named player of the match apart from the squad player", () => {
    const m = new TestMatch();
    const choice = choosePlayer(m.state, "A", "Ali", "squad-ali");
    expect(choice.id).toBe("squad-ali");
    expect(choice.drafts).toEqual([{ type: "player_added", player: { id: "squad-ali", name: "Ali", team: "A" } }]);
  });

  it("still matches by name when no squad id is given", () => {
    const m = new TestMatch();
    expect(choosePlayer(m.state, "A", "ali")).toEqual({ id: m.id("Ali"), drafts: [] });
    expect(choosePlayer(m.state, "A", "Ali", undefined, (player) => player.id !== m.id("Ali")).drafts).toHaveLength(1);
  });
});

describe("xiFor", () => {
  it("lists the XI only for the team's own side", () => {
    const team = teamOf(BILAL, FAISAL);
    expect(xiFor(team, "A")).toEqual([BILAL, FAISAL]);
    expect(xiFor(team, "B")).toEqual([]);
  });

  it("is empty when the match has no team", () => {
    expect(xiFor(undefined, "A")).toEqual([]);
  });
});

describe("chooseTypedPlayer", () => {
  it("turns a typed name that is in the XI into that squad player", () => {
    const m = new TestMatch();
    const choice = chooseTypedPlayer(m.state, "A", " bilal ", [BILAL, FAISAL]);
    expect(choice).toEqual({
      id: BILAL.id,
      drafts: [{ type: "player_added", player: { id: BILAL.id, name: "Bilal", team: "A" } }],
    });
  });

  it("gives a name outside the XI a fresh id like a plain typed name", () => {
    const m = new TestMatch();
    const choice = chooseTypedPlayer(m.state, "A", "Kamran", [BILAL, FAISAL]);
    expect(choice.id).not.toBe(BILAL.id);
    expect(choice.drafts).toEqual([{ type: "player_added", player: { id: choice.id, name: "Kamran", team: "A" } }]);
  });

  it("behaves like choosePlayer when the side has no XI", () => {
    const m = new TestMatch();
    expect(chooseTypedPlayer(m.state, "A", "ali", [])).toEqual({ id: m.id("Ali"), drafts: [] });
    expect(chooseTypedPlayer(m.state, "A", "Ali", [], (player) => player.id !== m.id("Ali")).drafts).toHaveLength(1);
  });
});

describe("fielderOptions", () => {
  it("is empty without an XI", () => {
    const m = new TestMatch();
    expect(fielderOptions([], m.state, m.id("Hamza"))).toEqual([]);
  });

  it("is the XI when the bowler is in it", () => {
    const m = new TestMatch({ toss: { winner: "A", choice: "bowl" } });
    const xi = [{ id: m.id("Ali"), name: "Ali" }, FAISAL];
    expect(fielderOptions(xi, m.state, m.id("Ali"))).toEqual(xi);
  });

  it("adds a bowler who is not in the XI so a catch off his own bowling can be recorded", () => {
    const m = new TestMatch({ toss: { winner: "A", choice: "bowl" } });
    expect(fielderOptions([FAISAL], m.state, m.id("Ali"))).toEqual([FAISAL, { id: m.id("Ali"), name: "Ali" }]);
  });

  it("ignores a bowler the match does not know", () => {
    const m = new TestMatch();
    expect(fielderOptions([FAISAL], m.state, "nobody")).toEqual([FAISAL]);
    expect(fielderOptions([FAISAL], m.state, null)).toEqual([FAISAL]);
  });
});

describe("buildPatch and the fielder's id", () => {
  it("sends the chosen squad id with the name", () => {
    expect(buildPatch(caught({ fielder: "Zain", fielderId: ZAIN.id }), rules).wicket).toEqual({
      kind: "caught",
      fielderName: "Zain",
      fielderId: ZAIN.id,
    });
  });

  it("sends a null id for a typed fielder, a missing fielder and dismissals with no fielder", () => {
    expect(buildPatch(caught({ fielder: "Zain" }), rules).wicket).toEqual({ kind: "caught", fielderName: "Zain", fielderId: null });
    expect(buildPatch(caught(), rules).wicket).toEqual({ kind: "caught", fielderName: null, fielderId: null });
    expect(buildPatch(caught({ wicketKind: "bowled", fielder: "Zain", fielderId: ZAIN.id }), rules).wicket).toEqual({
      kind: "bowled",
      fielderName: null,
      fielderId: null,
    });
  });

  it("never leaves the id out of a wicket patch", () => {
    for (const fielderId of [null, ZAIN.id]) {
      for (const wicketKind of ["bowled", "caught", "run_out", "stumped"] as const) {
        const wicket = buildPatch(caught({ wicketKind, fielder: "Zain", fielderId }), rules).wicket;
        expect(wicket).toHaveProperty("fielderId");
        expect(wicket?.fielderId).not.toBeUndefined();
      }
    }
  });

  it("sends no wicket for a ball without one", () => {
    expect(buildPatch(caught({ wicketKind: null, fielder: "Zain", fielderId: ZAIN.id }), rules)).not.toHaveProperty("wicket");
  });

  it("does not keep an id when the name is blank", () => {
    expect(buildPatch(caught({ fielder: "  ", fielderId: ZAIN.id }), rules).wicket).toEqual({
      kind: "caught",
      fielderName: null,
      fielderId: null,
    });
  });
});

describe("editing a wicket's fielder on a team ball", () => {
  it("pre-fills the id and the name from the ball", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain", fielderId: ZAIN.id } });
    expect(fieldsOf(editable(m, ball).item)).toMatchObject({ wicketKind: "caught", fielder: "Zain", fielderId: ZAIN.id });
  });

  it("pre-fills no id for a ball whose fielder was typed", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } });
    expect(fieldsOf(editable(m, ball).item)).toMatchObject({ fielder: "Zain", fielderId: null });
  });

  it("changes the fielder to another squad player", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain", fielderId: ZAIN.id } });
    const fields = fieldsOf(editable(m, ball).item);
    m.correct(ball.id, buildPatch({ ...fields, fielder: "Faisal", fielderId: FAISAL.id }, m.state.rules));
    expect(m.inn.batting.find((line) => line.playerId === m.id("Ali"))?.out).toMatchObject({
      fielderName: "Faisal",
      fielderId: FAISAL.id,
    });
  });

  it("clears the old id when the fielder is taken off or typed instead", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain", fielderId: ZAIN.id } });
    const fields = fieldsOf(editable(m, ball).item);

    m.correct(ball.id, buildPatch({ ...fields, fielder: "", fielderId: null }, m.state.rules));
    expect(m.inn.batting.find((line) => line.playerId === m.id("Ali"))?.out).toMatchObject({ fielderName: null, fielderId: null });

    m.correct(ball.id, buildPatch({ ...fields, fielder: "Kamran", fielderId: null }, m.state.rules));
    expect(m.inn.batting.find((line) => line.playerId === m.id("Ali"))?.out).toMatchObject({
      fielderName: "Kamran",
      fielderId: null,
    });
  });

  it("clears the id when the dismissal no longer has a fielder", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain", fielderId: ZAIN.id } });
    const fields = fieldsOf(editable(m, ball).item);
    m.correct(ball.id, buildPatch({ ...fields, wicketKind: "bowled" }, m.state.rules));
    expect(m.inn.batting.find((line) => line.playerId === m.id("Ali"))?.out).toMatchObject({
      kind: "bowled",
      fielderName: null,
      fielderId: null,
    });
  });

  it("counts a different squad fielder with the same name as a change", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain", fielderId: ZAIN.id } });
    const { item } = editable(m, ball);
    const fields = fieldsOf(item);
    expect(isUnchanged(buildPatch(fields, m.state.rules), item)).toBe(true);
    expect(isUnchanged(buildPatch({ ...fields, fielderId: "squad-other-zain" }, m.state.rules), item)).toBe(false);
    expect(isUnchanged(buildPatch({ ...fields, fielderId: null }, m.state.rules), item)).toBe(false);
  });

  it("does not report a ball with a typed fielder as changed", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } });
    const { item } = editable(m, ball);
    expect(isUnchanged(buildPatch(fieldsOf(item), m.state.rules), item)).toBe(true);
  });
});
