import { t } from "@/lib/i18n";
import type { EventDraft, MatchState, TeamSide } from "@/lib/scoring";
import { OVERS_MAX, OVERS_MIN } from "@/lib/validation/match-setup";

export const TARGET_MIN = 1;
export const TARGET_MAX = 999;

export type SettingsValues = { overs: string; playersA: number; playersB: number; target: string };
export type SettingsErrors = { overs?: string; target?: string };
export type SettingsDraft = Extract<EventDraft, { type: "settings_changed" }>;
export type SettingsResult = { ok: true; draft: SettingsDraft | null } | { ok: false; errors: SettingsErrors };

export function initialSettings(state: MatchState): SettingsValues {
  return {
    overs: String(state.rules.oversPerInnings),
    playersA: state.rules.playersPerSide.A,
    playersB: state.rules.playersPerSide.B,
    target: state.target === null ? "" : String(state.target),
  };
}

function wholeNumber(text: string, min: number, max: number): number | null {
  const value = text.trim() === "" ? Number.NaN : Number(text);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

export function settingsDraft(state: MatchState, values: SettingsValues, withTarget: boolean): SettingsResult {
  const overs = wholeNumber(values.overs, OVERS_MIN, OVERS_MAX);
  const target = withTarget ? wholeNumber(values.target, TARGET_MIN, TARGET_MAX) : null;
  if (overs === null || (withTarget && target === null)) {
    const errors: SettingsErrors = {};
    if (overs === null) errors.overs = t("setup.error.overs");
    if (withTarget && target === null) errors.target = t("settings.error.target");
    return { ok: false, errors };
  }

  const draft: SettingsDraft = { type: "settings_changed" };
  if (overs !== state.rules.oversPerInnings) draft.oversPerInnings = overs;
  const players: Partial<Record<TeamSide, number>> = {};
  if (values.playersA !== state.rules.playersPerSide.A) players.A = values.playersA;
  if (values.playersB !== state.rules.playersPerSide.B) players.B = values.playersB;
  if (Object.keys(players).length > 0) draft.playersPerSide = players;
  if (target !== null && target !== state.target) draft.target = target;
  return { ok: true, draft: Object.keys(draft).length > 1 ? draft : null };
}
