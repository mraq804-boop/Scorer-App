import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import { defaultRules } from "@/lib/scoring";
import { validateMatchSetup } from "@/lib/validation/match-setup";
import type { Rules } from "@/lib/scoring";

type Input = {
  teams: [string, string];
  rules: Rules;
  toss: { winner: "A" | "B"; choice: "bat" | "bowl" };
  striker: string;
  nonStriker: string;
  bowler: string;
};

function input(overrides: Partial<Input> = {}): Input {
  return {
    teams: ["Lions", "Tigers"],
    rules: defaultRules("tape", 10),
    toss: { winner: "A", choice: "bat" },
    striker: "Ali",
    nonStriker: "Usman",
    bowler: "Hamza",
    ...overrides,
  };
}

function failure(candidate: unknown) {
  const result = validateMatchSetup(candidate);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("validateMatchSetup", () => {
  it("accepts a complete setup and keeps it as is", () => {
    const result = validateMatchSetup(input());
    expect(result).toEqual({ ok: true, setup: input() });
  });

  it("trims every name", () => {
    const result = validateMatchSetup(
      input({ teams: ["  Lions ", "\tTigers\n"], striker: " Ali ", nonStriker: "Usman  ", bowler: "  Hamza" }),
    );
    expect(result).toMatchObject({
      ok: true,
      setup: { teams: ["Lions", "Tigers"], striker: "Ali", nonStriker: "Usman", bowler: "Hamza" },
    });
  });

  it("requires every name", () => {
    expect(Object.keys(failure(input({ teams: ["", "  "], striker: " ", nonStriker: "", bowler: "" }))).sort()).toEqual([
      "bowler",
      "nonStriker",
      "striker",
      "teamA",
      "teamB",
    ]);
  });

  it("allows 40 characters and rejects 41", () => {
    expect(validateMatchSetup(input({ teams: ["a".repeat(40), "b".repeat(40)], striker: "c".repeat(40) })).ok).toBe(true);
    expect(failure(input({ teams: ["a".repeat(41), "Tigers"] }))).toEqual({ teamA: expect.any(String) });
    expect(failure(input({ bowler: "d".repeat(41) }))).toEqual({ bowler: expect.any(String) });
  });

  it("counts characters the way the server does, not UTF-16 units", () => {
    expect(validateMatchSetup(input({ striker: "🏏".repeat(40) })).ok).toBe(true);
    expect(failure(input({ striker: "🏏".repeat(41) }))).toEqual({ striker: expect.any(String) });
  });

  it("accepts Urdu names", () => {
    expect(validateMatchSetup(input({ teams: ["لاہور قلندرز", "کراچی کنگز"] })).ok).toBe(true);
  });

  it("requires distinct openers, ignoring case and surrounding space", () => {
    expect(failure(input({ striker: "Ali", nonStriker: "Ali" }))).toEqual({ nonStriker: expect.any(String) });
    expect(failure(input({ striker: "Ali", nonStriker: " ali " }))).toEqual({ nonStriker: expect.any(String) });
  });

  it("asks for a name, not for different openers, when the openers are empty", () => {
    const errors = failure(input({ striker: "", nonStriker: "" }));
    expect(errors).toEqual({ striker: t("setup.error.required"), nonStriker: t("setup.error.required") });
  });

  it("allows the bowler to share a name with an opener", () => {
    expect(validateMatchSetup(input({ bowler: "Ali" })).ok).toBe(true);
  });

  it("keeps overs between 1 and 100", () => {
    const withOvers = (oversPerInnings: number) => input({ rules: { ...defaultRules("tape", 10), oversPerInnings } });
    for (const valid of [1, 10, 100]) expect(validateMatchSetup(withOvers(valid)).ok).toBe(true);
    for (const invalid of [0, -5, 101, 2.5, Number.NaN]) expect(failure(withOvers(invalid))).toEqual({ overs: t("setup.error.overs") });
  });

  it("keeps players per side between 2 and 15", () => {
    const withPlayers = (a: number, b: number) =>
      input({ rules: { ...defaultRules("tape", 10), playersPerSide: { A: a, B: b } } });
    expect(validateMatchSetup(withPlayers(2, 15)).ok).toBe(true);
    expect(failure(withPlayers(1, 11))).toEqual({ form: expect.any(String) });
    expect(failure(withPlayers(11, 16))).toEqual({ form: expect.any(String) });
  });

  it("rejects balls per over other than 6 or 8", () => {
    const rules = { ...defaultRules("tape", 10), ballsPerOver: 7 } as unknown as Rules;
    expect(failure(input({ rules }))).toEqual({ form: expect.any(String) });
  });

  it("rejects unknown ball types and toss values", () => {
    expect(failure(input({ rules: { ...defaultRules("tape", 10), ballType: "leather" as Rules["ballType"] } }))).toEqual({
      form: expect.any(String),
    });
    expect(failure(input({ toss: { winner: "C" as "A", choice: "bat" } }))).toEqual({ form: expect.any(String) });
  });

  it("reports every problem at once", () => {
    const errors = failure(input({ teams: ["", "Tigers"], striker: "Ali", nonStriker: "Ali" }));
    expect(Object.keys(errors).sort()).toEqual(["nonStriker", "teamA"]);
  });
});
