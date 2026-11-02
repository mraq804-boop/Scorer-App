import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import { defaultRules } from "@/lib/scoring";
import { oversToBalls, validateEnteredInnings } from "@/lib/validation/entered-innings";
import type { EnteredForm } from "@/lib/validation/entered-innings";

const T20 = defaultRules("tape", 20);

function form(overrides: Partial<EnteredForm> = {}): EnteredForm {
  return {
    runs: "145",
    wickets: "7",
    overs: "19.4",
    bowlers: [
      { player: "p-hamza", overs: "4", runs: "28", wickets: "2" },
      { player: "p-usman", overs: "3.4", runs: "30", wickets: "3" },
    ],
    ...overrides,
  };
}

function errors(input: EnteredForm) {
  const result = validateEnteredInnings(input, T20, "B");
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("oversToBalls", () => {
  it("reads whole and part overs for the balls in an over", () => {
    expect(oversToBalls("19.4", 6)).toBe(118);
    expect(oversToBalls(" 20 ", 6)).toBe(120);
    expect(oversToBalls("0.5", 6)).toBe(5);
    expect(oversToBalls("3.7", 8)).toBe(31);
  });

  it("refuses anything that isn't overs", () => {
    for (const bad of ["", "abc", "-1", "3.6", "1.2.3", "4.", ".3"]) expect(oversToBalls(bad, 6)).toBeNull();
  });
});

describe("validateEnteredInnings", () => {
  it("lets one bowler bowl more than the usual share, as long as it fits the innings", () => {
    const result = validateEnteredInnings(form({ bowlers: [{ player: "p-hamza", overs: "6", runs: "40", wickets: "2" }] }), T20, "B");
    expect(result.ok).toBe(true);
  });

  it("turns the form into totals and bowler figures, skipping blank rows", () => {
    const result = validateEnteredInnings(
      form({ bowlers: [...form().bowlers, { player: "", overs: "", runs: "", wickets: "" }, { player: "p-zain", overs: "1", runs: "", wickets: "" }] }),
      T20,
      "B",
    );

    expect(result).toEqual({
      ok: true,
      value: {
        runs: 145,
        wickets: 7,
        legalBalls: 118,
        bowlers: [
          { player: "p-hamza", legalBalls: 24, runs: 28, wickets: 2 },
          { player: "p-usman", legalBalls: 22, runs: 30, wickets: 3 },
          { player: "p-zain", legalBalls: 6, runs: 0, wickets: 0 },
        ],
      },
    });
  });

  it("checks the team total", () => {
    for (const runs of ["", "abc", "-1", "4.5", "1000"]) expect(errors(form({ runs })).runs).toBe(t("entered.error.runs"));
    expect(errors(form({ wickets: "11" })).wickets).toBe(t("entered.error.wickets", { max: 10 }));
    expect(errors(form({ overs: "20.1" })).overs).toBe(t("entered.error.overs", { max: "20" }));
    expect(errors(form({ overs: "" })).overs).toBe(t("entered.error.overs", { max: "20" }));
  });

  it("checks each bowler's row", () => {
    expect(errors(form({ bowlers: [{ player: "", overs: "2", runs: "10", wickets: "1" }] }))["0.player"]).toBe(t("entered.error.pickBowler"));
    expect(errors(form({ bowlers: [{ player: "p-hamza", overs: "19.5", runs: "10", wickets: "1" }] }))["0.overs"]).toBe(
      t("entered.error.bowlerOvers", { max: "19.4" }),
    );
    expect(errors(form({ bowlers: [{ player: "p-hamza", overs: "x", runs: "10", wickets: "1" }] }))["0.overs"]).toBe(
      t("entered.error.bowlerOvers", { max: "19.4" }),
    );
    expect(errors(form({ bowlers: [{ player: "p-hamza", overs: "2", runs: "x", wickets: "1" }] }))["0.runs"]).toBe(t("entered.error.runs"));
    expect(errors(form({ bowlers: [{ player: "p-hamza", overs: "2", runs: "10", wickets: "11" }] }))["0.wickets"]).toBe(
      t("entered.error.wickets", { max: 10 }),
    );
    const twice = errors(form({ bowlers: [form().bowlers[0], { ...form().bowlers[0], overs: "1" }] }));
    expect(twice["1.player"]).toBe(t("entered.error.sameBowler"));
  });

  it("won't let the bowlers' figures add up to more than the team's", () => {
    const many = { player: "p-hamza", overs: "4", runs: "28", wickets: "4" };
    expect(errors(form({ wickets: "3", bowlers: [many] })).bowlers).toBe(t("entered.error.totalWickets", { n: 3 }));
    const two = [
      { player: "p-hamza", overs: "2", runs: "10", wickets: "1" },
      { player: "p-usman", overs: "2", runs: "10", wickets: "1" },
    ];
    expect(errors(form({ overs: "3", bowlers: two })).bowlers).toBe(t("entered.error.totalOvers", { overs: "3" }));
    expect(errors(form({ runs: "20", bowlers: [{ ...many, wickets: "1" }] })).bowlers).toBe(t("entered.error.totalRuns", { n: 20 }));
  });
});
