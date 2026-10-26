import { describe, expect, it } from "vitest";
import { initialSettings, settingsDraft } from "@/components/scoring/settings-draft";
import { TestMatch } from "../../helpers/match";

const OVERS_ERROR = "Enter overs from 1 to 100";
const TARGET_ERROR = "Enter a target from 1 to 999";

function chase(): TestMatch {
  const m = new TestMatch();
  m.over([1, 0, 0, 0, 0, 0]);
  m.endInnings("manual");
  m.startInnings2(["Zain", "Faisal"], "Usman");
  return m;
}

describe("initialSettings", () => {
  it("starts from the match as it is now", () => {
    const m = chase();
    expect(initialSettings(m.state)).toEqual({ overs: "10", playersA: 11, playersB: 11, target: "2" });
  });

  it("has an empty target before there is one", () => {
    expect(initialSettings(new TestMatch().state).target).toBe("");
  });
});

describe("settingsDraft", () => {
  it("has nothing to record when nothing changed", () => {
    const m = chase();
    expect(settingsDraft(m.state, initialSettings(m.state), true)).toEqual({ ok: true, draft: null });
  });

  it("records only the settings that changed", () => {
    const m = new TestMatch();
    const values = initialSettings(m.state);
    expect(settingsDraft(m.state, { ...values, overs: "1" }, false)).toEqual({
      ok: true,
      draft: { type: "settings_changed", oversPerInnings: 1 },
    });
    expect(settingsDraft(m.state, { ...values, playersB: 12 }, false)).toEqual({
      ok: true,
      draft: { type: "settings_changed", playersPerSide: { B: 12 } },
    });
    expect(settingsDraft(m.state, { ...values, playersA: 9, playersB: 12, overs: " 8 " }, false)).toEqual({
      ok: true,
      draft: { type: "settings_changed", oversPerInnings: 8, playersPerSide: { A: 9, B: 12 } },
    });
  });

  it("sets a manual target only in the chase and only when it changed", () => {
    const m = chase();
    const values = initialSettings(m.state);
    expect(settingsDraft(m.state, { ...values, target: "25" }, true)).toEqual({
      ok: true,
      draft: { type: "settings_changed", target: 25 },
    });
    expect(settingsDraft(m.state, { ...values, target: "25" }, false)).toEqual({ ok: true, draft: null });
  });

  it("rejects overs that are not a whole number from 1 to 100", () => {
    const m = new TestMatch();
    const values = initialSettings(m.state);
    for (const overs of ["", "  ", "0", "101", "2.5", "abc", "-3"]) {
      expect(settingsDraft(m.state, { ...values, overs }, false)).toEqual({ ok: false, errors: { overs: OVERS_ERROR } });
    }
    expect(settingsDraft(m.state, { ...values, overs: "100" }, false)).toMatchObject({ ok: true });
  });

  it("rejects a target that is not a whole number from 1 to 999", () => {
    const m = chase();
    const values = initialSettings(m.state);
    for (const target of ["", "0", "1000", "7.5", "x"]) {
      expect(settingsDraft(m.state, { ...values, target }, true)).toEqual({ ok: false, errors: { target: TARGET_ERROR } });
    }
    expect(settingsDraft(m.state, { ...values, target: "999" }, true)).toMatchObject({ ok: true });
  });

  it("reports every invalid field at once", () => {
    const m = chase();
    expect(settingsDraft(m.state, { ...initialSettings(m.state), overs: "0", target: "0" }, true)).toEqual({
      ok: false,
      errors: { overs: OVERS_ERROR, target: TARGET_ERROR },
    });
  });
});
