import { z } from "zod";
import { t } from "@/lib/i18n";
import type { MatchSetup } from "@/lib/local/matches";

export const NAME_MAX_LENGTH = 40;
export const OVERS_MIN = 1;
export const OVERS_MAX = 100;
export const PLAYERS_MIN = 2;
export const PLAYERS_MAX = 15;
export const EXTRA_RUNS_MAX = 5;

export type MatchSetupField = "teamA" | "teamB" | "overs" | "striker" | "nonStriker" | "bowler" | "form";
export type MatchSetupErrors = Partial<Record<MatchSetupField, string>>;
export type MatchSetupResult = { ok: true; setup: MatchSetup } | { ok: false; errors: MatchSetupErrors };

const name = z
  .string()
  .trim()
  .min(1, t("setup.error.required"))
  .refine((value) => Array.from(value).length <= NAME_MAX_LENGTH, t("setup.error.tooLong"));

const side = z.enum(["A", "B"]);
const players = z.number().int().min(PLAYERS_MIN).max(PLAYERS_MAX);
const extraRuns = z.number().int().min(0).max(EXTRA_RUNS_MAX);

const rules = z.object({
  ballType: z.enum(["tape", "tennis", "hard", "custom"]),
  oversPerInnings: z
    .number(t("setup.error.overs"))
    .int(t("setup.error.overs"))
    .min(OVERS_MIN, t("setup.error.overs"))
    .max(OVERS_MAX, t("setup.error.overs")),
  ballsPerOver: z.union([z.literal(6), z.literal(8)]),
  playersPerSide: z.object({ A: players, B: players }),
  wideRuns: extraRuns,
  wideRebowled: z.boolean(),
  noBallRuns: extraRuns,
  freeHit: z.boolean(),
  lbw: z.boolean(),
  lastManStands: z.boolean(),
});

function sameName(first: string, second: string): boolean {
  return first.toLocaleLowerCase() === second.toLocaleLowerCase();
}

export const matchSetupSchema = z
  .object({
    teams: z.tuple([name, name]),
    rules,
    toss: z.object({ winner: side, choice: z.enum(["bat", "bowl"]) }),
    striker: name,
    nonStriker: name,
    bowler: name,
  })
  .refine(({ striker, nonStriker }) => striker === "" || nonStriker === "" || !sameName(striker, nonStriker), {
    path: ["nonStriker"],
    error: t("setup.error.sameOpener"),
  });

function fieldFor(path: PropertyKey[]): MatchSetupField {
  const [head, next] = path;
  if (head === "teams") return next === 0 ? "teamA" : "teamB";
  if (head === "rules" && next === "oversPerInnings") return "overs";
  if (head === "striker" || head === "nonStriker" || head === "bowler") return head;
  return "form";
}

export function validateMatchSetup(input: unknown): MatchSetupResult {
  const parsed = matchSetupSchema.safeParse(input);
  if (parsed.success) return { ok: true, setup: parsed.data };
  const errors: MatchSetupErrors = {};
  for (const issue of parsed.error.issues) {
    const field = fieldFor(issue.path);
    errors[field] ??= field === "form" ? t("setup.error.form") : issue.message;
  }
  return { ok: false, errors };
}
