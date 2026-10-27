import { z } from "zod";
import { t } from "@/lib/i18n";
import type { Season, SquadPlayer } from "@/lib/team";
import type { NewTeam } from "@/lib/team/remote";
import { nameSchema } from "./match-setup";

export const GROUND_MAX_LENGTH = 60;
export const DEFAULT_TIME_ZONE = "Asia/Karachi";

export type Validated<T, F extends string> = { ok: true; value: T } | { ok: false; errors: Partial<Record<F, string>> };

export type TeamField = "name" | "homeGround" | "timeZone";
export type PlayerField = "name";
export type SeasonField = "name" | "startsOn" | "endsOn";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isTimeZone(value: string): boolean {
  if (value === "") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const groundSchema = z
  .string()
  .trim()
  .refine((value) => Array.from(value).length <= GROUND_MAX_LENGTH, t("team.error.groundTooLong"))
  .transform((value) => (value === "" ? null : value));

const teamSchema = z.object({
  name: nameSchema,
  homeGround: groundSchema,
  timeZone: z.string().refine(isTimeZone, t("team.error.timeZone")),
});

const playerSchema = z.object({
  id: z.string().min(1),
  name: nameSchema,
  role: z.enum(["batter", "bowler", "allrounder", "keeper"]).nullable(),
  active: z.boolean(),
});

const day = z.string().refine(isDay, t("team.error.date"));

const seasonSchema = z
  .object({
    id: z.string().min(1),
    name: nameSchema,
    startsOn: day,
    endsOn: day,
  })
  .refine(({ startsOn, endsOn }) => endsOn >= startsOn, {
    path: ["endsOn"],
    error: t("team.error.seasonEnd"),
  });

function validate<T, F extends string>(schema: z.ZodType<T>, input: unknown): Validated<T, F> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  const errors: Partial<Record<F, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as F;
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}

export function validateTeam(input: { name: string; homeGround: string; timeZone: string }): Validated<NewTeam, TeamField> {
  return validate(teamSchema, input);
}

export function validatePlayer(input: SquadPlayer): Validated<SquadPlayer, PlayerField> {
  return validate(playerSchema, input);
}

export function validateSeason(input: Season): Validated<Season, SeasonField> {
  return validate(seasonSchema, input);
}
