import { describe, expect, it } from "vitest";
import { hatTricksIn, matchRecord } from "@/lib/team";
import { TestMatch } from "../../helpers/match";

const NEXT_BATTERS = ["Saad", "Kamran", "Bilal", "Faisal", "Zain", "Danish", "Essa"];

function wicketsInARow(m: TestMatch, count: number, start = 0): void {
  for (let i = 0; i < count; i += 1) {
    m.ball({ runs: 0, wicket: { kind: i % 2 === 0 ? "bowled" : "lbw" } });
    m.batter(NEXT_BATTERS[start + i] ?? `Extra ${start + i}`);
  }
}

describe("hatTricksIn", () => {
  it("counts three wickets in three balls", () => {
    const m = new TestMatch();
    wicketsInARow(m, 3);
    expect(hatTricksIn(m.inn).get(m.id("Hamza"))).toBe(1);
  });

  it("is not broken by a wide in between", () => {
    const m = new TestMatch();
    wicketsInARow(m, 1);
    m.ball({ kind: "wide", runs: 0 });
    wicketsInARow(m, 2, 1);
    expect(hatTricksIn(m.inn).get(m.id("Hamza"))).toBe(1);
  });

  it("carries across the other bowler's over", () => {
    const m = new TestMatch();
    for (let i = 0; i < 5; i += 1) m.ball({ runs: 0 });
    wicketsInARow(m, 1);
    m.bowler("Bilal");
    for (let i = 0; i < 6; i += 1) m.ball({ runs: 0 });
    m.bowler("Hamza");
    wicketsInARow(m, 2, 1);
    expect(hatTricksIn(m.inn).get(m.id("Hamza"))).toBe(1);
  });

  it("is broken by a run-out, which the bowler does not get", () => {
    const m = new TestMatch();
    wicketsInARow(m, 1);
    m.ball({ runs: 0, wicket: { kind: "run_out" } });
    m.batter("Kamran");
    wicketsInARow(m, 2, 2);
    expect(hatTricksIn(m.inn).get(m.id("Hamza")) ?? 0).toBe(0);
  });

  it("counts six in a row as two", () => {
    const m = new TestMatch();
    wicketsInARow(m, 6);
    expect(hatTricksIn(m.inn).get(m.id("Hamza"))).toBe(2);
  });
});

describe("match records with hat-tricks", () => {
  it("records the bowler's hat-trick", () => {
    const m = new TestMatch();
    wicketsInARow(m, 3);
    const record = matchRecord(m.state, "B", [m.id("Hamza")], "2026-04-01T10:00:00.000Z");
    expect(record.players[0].bowling?.hatTricks).toBe(1);
  });

  it("leaves the hat-trick field out when there is none", () => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    const record = matchRecord(m.state, "B", [m.id("Hamza")], "2026-04-01T10:00:00.000Z");
    expect(JSON.stringify(record)).not.toContain("hatTricks");
  });
});
