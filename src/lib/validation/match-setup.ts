import { z } from "zod";
import { t } from "@/lib/i18n";
import type { MatchSetup, SetupPlayer } from "@/lib/local/matches";

export const NAME_MAX_LENGTH = 40;
export const OVERS_MIN = 1;
export const OVERS_MAX = 100;
export const PLAYERS_MIN = 2;
export const PLAYERS_MAX = 15;
export const EXTRA_RUNS_MAX = 5;

export type MatchSetupField = "teamA" | "teamB" | "overs" | "xi" | "striker" | "nonStriker" | "bowler" | "form";
export type MatchSetupErrors = Partial<Record<MatchSetupField, string>>;
export type MatchSetupResult = { ok: true; setup: MatchSetup } | { ok: false; errors: MatchSetupErrors };

export const nameSchema = z
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

export function sameName(first: string, second: string): boolean {
  return first.toLocaleLowerCase() === second.toLocaleLowerCase();
}

const squadPlayer = z.object({ id: z.string().min(1), name: nameSchema });
const setupPlayer = z.union([nameSchema, squadPlayer]);

const teamSetup = z.object({
  id: z.string().min(1),
  fixtureId: z.string().min(1).nullable(),
  xi: z.array(squadPlayer).min(PLAYERS_MIN, t("setup.error.xi")),
});

const OPENING_FIELDS = ["striker", "nonStriker", "bowler"] as const;

function playerName(player: SetupPlayer): string {
  return typeof player === "string" ? player : player.name;
}

function isSamePlayer(first: SetupPlayer, second: SetupPlayer): boolean {
  if (typeof first !== "string" && typeof second !== "string") return first.id === second.id;
  return sameName(playerName(first), playerName(second));
}

export const matchSetupSchema = z
  .object({
    teams: z.tuple([nameSchema, nameSchema]),
    rules,
    toss: z.object({ winner: side, choice: z.enum(["bat", "bowl"]) }),
    striker: setupPlayer,
    nonStriker: setupPlayer,
    bowler: setupPlayer,
    team: teamSetup.optional(),
  })
  .refine(
    ({ striker, nonStriker }) =>
      playerName(striker) === "" || playerName(nonStriker) === "" || !isSamePlayer(striker, nonStriker),
    { path: ["nonStriker"], error: t("setup.error.sameOpener") },
  )
  .superRefine((setup, context) => {
    if (setup.team === undefined) return;
    const playing = new Set(setup.team.xi.map((player) => player.id));
    for (const field of OPENING_FIELDS) {
      const chosen = setup[field];
      if (typeof chosen !== "string" && !playing.has(chosen.id)) {
        context.addIssue({ code: "custom", path: [field], message: t("setup.error.notInXi") });
      }
    }
  });

function fieldFor(path: PropertyKey[]): MatchSetupField {
  const [head, next] = path;
  if (head === "teams") return next === 0 ? "teamA" : "teamB";
  if (head === "rules" && next === "oversPerInnings") return "overs";
  if (head === "team" && next === "xi") return "xi";
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
