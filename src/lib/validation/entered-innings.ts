import { t } from "@/lib/i18n";
import { allOutWickets, bowlerQuota, formatOvers } from "@/lib/scoring";
import type { EnteredBowler, Rules, TeamSide } from "@/lib/scoring";

export const RUNS_MAX = 999;

export type EnteredBowlerForm = { player: string; overs: string; runs: string; wickets: string };
export type EnteredForm = { runs: string; wickets: string; overs: string; bowlers: EnteredBowlerForm[] };
export type EnteredTotals = { runs: number; wickets: number; legalBalls: number; bowlers: EnteredBowler[] };
export type EnteredErrors = Partial<Record<string, string>>;
export type EnteredResult = { ok: true; value: EnteredTotals } | { ok: false; errors: EnteredErrors };

const WHOLE = /^\d+$/;
const OVERS = /^(\d+)(?:\.(\d))?$/;

export function oversToBalls(value: string, ballsPerOver: number): number | null {
  const match = OVERS.exec(value.trim());
  if (match === null) return null;
  const balls = match[2] === undefined ? 0 : Number(match[2]);
  if (balls >= ballsPerOver) return null;
  return Number(match[1]) * ballsPerOver + balls;
}

function count(value: string, max: number, blank: number | null = null): number | null {
  const trimmed = value.trim();
  if (trimmed === "" && blank !== null) return blank;
  if (!WHOLE.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed <= max ? parsed : null;
}

function isBlank(row: EnteredBowlerForm): boolean {
  return [row.player, row.overs, row.runs, row.wickets].every((value) => value.trim() === "");
}

export function validateEnteredInnings(form: EnteredForm, rules: Rules, battingTeam: TeamSide): EnteredResult {
  const errors: EnteredErrors = {};
  const { ballsPerOver } = rules;
  const maxWickets = allOutWickets(rules, battingTeam);
  const maxBalls = rules.oversPerInnings * ballsPerOver;
  const quotaBalls = bowlerQuota(rules) * ballsPerOver;

  const runs = count(form.runs, RUNS_MAX);
  if (runs === null) errors.runs = t("entered.error.runs");
  const wickets = count(form.wickets, maxWickets);
  if (wickets === null) errors.wickets = t("entered.error.wickets", { max: maxWickets });
  const legalBalls = oversToBalls(form.overs, ballsPerOver);
  if (legalBalls === null || legalBalls > maxBalls) errors.overs = t("entered.error.overs", { max: formatOvers(maxBalls, ballsPerOver) });

  const bowlers: EnteredBowler[] = [];
  const seen = new Set<string>();
  form.bowlers.forEach((row, index) => {
    if (isBlank(row)) return;
    const player = row.player.trim();
    if (player === "") errors[`${index}.player`] = t("entered.error.pickBowler");
    else if (seen.has(player)) errors[`${index}.player`] = t("entered.error.sameBowler");
    seen.add(player);
    const balls = oversToBalls(row.overs, ballsPerOver);
    if (balls === null || balls > quotaBalls) errors[`${index}.overs`] = t("entered.error.bowlerOvers", { max: bowlerQuota(rules) });
    const given = count(row.runs, RUNS_MAX, 0);
    if (given === null) errors[`${index}.runs`] = t("entered.error.runs");
    const taken = count(row.wickets, maxWickets, 0);
    if (taken === null) errors[`${index}.wickets`] = t("entered.error.wickets", { max: maxWickets });
    if (player !== "" && balls !== null && given !== null && taken !== null) {
      bowlers.push({ player, legalBalls: balls, runs: given, wickets: taken });
    }
  });

  if (runs !== null && wickets !== null && legalBalls !== null && Object.keys(errors).length === 0) {
    const sum = (pick: (bowler: EnteredBowler) => number) => bowlers.reduce((total, bowler) => total + pick(bowler), 0);
    if (sum((bowler) => bowler.wickets) > wickets) errors.bowlers = t("entered.error.totalWickets", { n: wickets });
    else if (sum((bowler) => bowler.legalBalls) > legalBalls) {
      errors.bowlers = t("entered.error.totalOvers", { overs: formatOvers(legalBalls, ballsPerOver) });
    } else if (sum((bowler) => bowler.runs) > runs) errors.bowlers = t("entered.error.totalRuns", { n: runs });
  }

  if (Object.keys(errors).length > 0 || runs === null || wickets === null || legalBalls === null) return { ok: false, errors };
  return { ok: true, value: { runs, wickets, legalBalls, bowlers } };
}
