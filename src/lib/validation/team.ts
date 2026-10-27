import { z } from "zod";
import { t } from "@/lib/i18n";
import type { Season, SquadPlayer } from "@/lib/team";
import type { FixtureInput, NewTeam } from "@/lib/team/remote";
import { OVERS_MAX, OVERS_MIN, nameSchema } from "./match-setup";

export const GROUND_MAX_LENGTH = 60;
export const DEFAULT_TIME_ZONE = "Asia/Karachi";
export const NOTES_MAX_LENGTH = 280;

export type Validated<T, F extends string> = { ok: true; value: T } | { ok: false; errors: Partial<Record<F, string>> };

export type TeamField = "name" | "homeGround" | "timeZone";
export type PlayerField = "name";
export type SeasonField = "name" | "startsOn" | "endsOn";
export type FixtureField = "day" | "time" | "opponent" | "ground" | "overs" | "notes";

export type FixtureForm = {
  id: string;
  day: string;
  time: string;
  opponent: string;
  ground: string;
  homeAway: "home" | "away" | "";
  overs: string;
  notes: string;
  status: FixtureInput["status"];
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const WHOLE_NUMBER = /^\d+$/;

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function wallClock(instant: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

function offsetAt(instant: number, timeZone: string): number {
  const wall = wallClock(instant, timeZone);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - Math.floor(instant / 1000) * 1000;
}

export function zonedToIso(day: string, time: string, timeZone: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  const guess = wall - offsetAt(wall, timeZone);
  return new Date(wall - offsetAt(guess, timeZone)).toISOString();
}

export function zonedParts(iso: string, timeZone: string): { day: string; time: string } {
  const wall = wallClock(Date.parse(iso), timeZone);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return { day: `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}`, time: `${pad(wall.hour)}:${pad(wall.minute)}` };
}

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

function optionalText(max: number, message: string) {
  return z
    .string()
    .trim()
    .refine((value) => Array.from(value).length <= max, message)
    .transform((value) => (value === "" ? null : value));
}

const groundSchema = optionalText(GROUND_MAX_LENGTH, t("team.error.groundTooLong"));

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

const oversSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || (WHOLE_NUMBER.test(value) && Number(value) >= OVERS_MIN && Number(value) <= OVERS_MAX),
    t("setup.error.overs"),
  )
  .transform((value) => (value === "" ? null : Number(value)));

const fixtureSchema = z.object({
  id: z.string().min(1),
  day,
  time: z.string().refine((value) => CLOCK.test(value), t("team.error.time")),
  opponent: nameSchema,
  ground: groundSchema,
  homeAway: z.enum(["home", "away", ""]).transform((value) => (value === "" ? null : value)),
  overs: oversSchema,
  notes: optionalText(NOTES_MAX_LENGTH, t("team.error.notesTooLong")),
  status: z.enum(["scheduled", "played", "cancelled"]),
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

export function validateFixture(input: FixtureForm, timeZone: string): Validated<FixtureInput, FixtureField> {
  const checked = validate<z.infer<typeof fixtureSchema>, FixtureField>(fixtureSchema, input);
  if (!checked.ok) return checked;
  const { day: date, time, ...fixture } = checked.value;
  return { ok: true, value: { ...fixture, startsAt: zonedToIso(date, time, timeZone) } };
}
