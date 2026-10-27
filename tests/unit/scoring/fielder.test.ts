import { describe, expect, it } from "vitest";
import { canCorrect, deliveryDraft } from "@/lib/scoring";
import { TestMatch, batterLine } from "../../helpers/match";

describe("dismissal fielder id", () => {
  it("carries fielderId into the dismissal", () => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain", fielderId: "sq-zain" } });
    expect(batterLine(m, "Ali").out).toEqual({
      kind: "caught",
      bowler: m.id("Hamza"),
      fielderName: "Zain",
      fielderId: "sq-zain",
    });
  });

  it("old events without fielderId replay with fielderId null", () => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(batterLine(m, "Ali").out?.fielderId).toBeNull();
  });

  it("a retirement has no fielder id", () => {
    const m = new TestMatch();
    m.push({ type: "retired", player: m.id("Ali"), how: "out" });
    expect(batterLine(m, "Ali").out).toEqual({ kind: "retired_out", bowler: null, fielderName: null, fielderId: null });
  });

  it("drafts without fielderId omit the key", () => {
    const m = new TestMatch();
    const draft = deliveryDraft(m.state, { runs: 0, wicket: { kind: "bowled" } });
    expect("fielderId" in draft.wicket!).toBe(false);
  });

  it("drafts copy fielderId when provided", () => {
    const m = new TestMatch();
    const draft = deliveryDraft(m.state, {
      runs: 0,
      wicket: { kind: "caught", fielderName: "Zain", fielderId: "sq-zain" },
    });
    expect(draft.wicket).toEqual({ kind: "caught", playerOut: m.id("Ali"), fielderName: "Zain", fielderId: "sq-zain" });
  });

  it("a correction can set fielderId and keeps playerOut", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1, wicket: { kind: "run_out", playerOut: m.id("Usman") } });
    const patch = { wicket: { kind: "run_out", fielderName: "Zain", fielderId: "sq-zain" } } as const;
    expect(canCorrect(e, patch)).toBe(true);
    m.correct(e.id, patch);
    expect(batterLine(m, "Usman").out).toEqual({
      kind: "run_out",
      bowler: null,
      fielderName: "Zain",
      fielderId: "sq-zain",
    });
    expect(batterLine(m, "Ali").out).toBeNull();
    expect(m.inn.wickets).toBe(1);
  });

  it("a correction can clear fielderId", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain", fielderId: "sq-zain" } });
    m.correct(e.id, { wicket: { kind: "caught", fielderName: "Zain", fielderId: null } });
    expect(batterLine(m, "Ali").out?.fielderId).toBeNull();
  });

  it("a correction without the key leaves fielderId as recorded", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain", fielderId: "sq-zain" } });
    m.correct(e.id, { runs: 1, wicket: { kind: "caught", fielderName: "Zain" } });
    expect(batterLine(m, "Ali").out?.fielderId).toBe("sq-zain");
  });
});
