"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useId, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/i18n";
import type { CachedTeam } from "@/lib/local/db";
import { aggregateTeamStats } from "@/lib/team";
import type { TeamPageData, TeamPageMatch } from "@/lib/team";
import { fetchTeamPage, setPotm, setResultOverride } from "@/lib/team/remote";
import type { TeamError, TeamResult } from "@/lib/team/remote";
import { FormAlert, SelectField, teamErrorMessage } from "./form";

type MatchOutcomesProps = { client: SupabaseClient; team: CachedTeam };

type Load = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; page: TeamPageData };

type OutcomeRowProps = {
  match: TeamPageMatch;
  names: ReadonlyMap<string, string>;
  suggestion: string | null;
  when: string | null;
  onChange: (change: () => Promise<TeamResult<void>>) => Promise<string | undefined>;
  client: SupabaseClient;
};

function outcomeError(error: TeamError): string {
  return error === "not_in_xi" ? t("team.error.notInXi") : teamErrorMessage(error);
}

function OutcomeRow({ match, names, suggestion, when, onChange, client }: OutcomeRowProps) {
  const noResultId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const counted = match.record !== null && (match.status === "complete" || match.resultOverride === "no_result");
  const xi = match.record?.xi.filter((id) => names.has(id)) ?? [];

  const change = async (call: () => Promise<TeamResult<void>>) => {
    setBusy(true);
    setError(undefined);
    try {
      setError(await onChange(call));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-semibold">
          <bdi>{match.title}</bdi>
        </span>
        {when !== null && <span className="num text-sm text-muted-foreground">{when}</span>}
        <span className="truncate text-sm">
          <bdi>{match.status === "complete" ? (match.result ?? "") : t("team.outcomes.live")}</bdi>
        </span>
      </div>
      {counted && (
        <SelectField
          label={t("team.outcomes.potm")}
          value={match.potmPlayerId ?? ""}
          onChange={(playerId) => void change(() => setPotm(client, match.code, playerId === "" ? null : playerId))}
        >
          <option value="">
            {suggestion === null ? t("team.outcomes.noSuggestion") : t("team.outcomes.suggested", { name: suggestion })}
          </option>
          {xi.map((id) => (
            <option key={id} value={id}>
              {names.get(id)}
            </option>
          ))}
        </SelectField>
      )}
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={noResultId}>{t("team.outcomes.noResult")}</Label>
          <span className="text-sm text-muted-foreground">{t("team.outcomes.noResultHint")}</span>
        </span>
        <Switch
          id={noResultId}
          disabled={busy}
          checked={match.resultOverride === "no_result"}
          onCheckedChange={(noResult) => void change(() => setResultOverride(client, match.code, noResult))}
        />
      </div>
      {error !== undefined && <FormAlert message={error} />}
    </li>
  );
}

export function MatchOutcomes({ client, team }: MatchOutcomesProps) {
  const headingId = useId();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void fetchTeamPage(client, team.code).then((result) => {
      if (active) setLoad(result.ok ? { kind: "ready", page: result.value } : { kind: "failed" });
    });
    return () => {
      active = false;
    };
  }, [client, team.code]);

  const view = useMemo(() => {
    if (load.kind !== "ready") return null;
    const { page } = load;
    const filter = { seasonId: null, seasons: page.seasons, timeZone: page.team.timeZone };
    const suggested = aggregateTeamStats(
      page.matches.map((match) => ({ ...match, potmPlayerId: null })),
      page.squad,
      filter,
    ).potm;
    const format = new Intl.DateTimeFormat(undefined, {
      timeZone: page.team.timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return {
      matches: page.matches,
      names: new Map(page.squad.map((player) => [player.id, player.name])),
      suggestion: (code: string) => {
        const pick = suggested[code];
        return pick === null || pick === undefined
          ? null
          : (page.squad.find((player) => player.id === pick.playerId)?.name ?? null);
      },
      when: (match: TeamPageMatch) => (match.record === null ? null : format.format(new Date(match.record.playedAt))),
    };
  }, [load]);

  const onChange = async (call: () => Promise<TeamResult<void>>): Promise<string | undefined> => {
    const result = await call();
    if (!result.ok) return outcomeError(result.error);
    const refreshed = await fetchTeamPage(client, team.code);
    if (refreshed.ok) setLoad({ kind: "ready", page: refreshed.value });
    return undefined;
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-bold">
        {t("team.outcomes.title")}
      </h2>
      {load.kind === "loading" && <p className="text-sm text-muted-foreground">{t("team.loading")}</p>}
      {load.kind === "failed" && <FormAlert message={t("team.outcomes.loadFailed")} />}
      {view !== null && view.matches.length === 0 && <p className="text-sm text-muted-foreground">{t("team.outcomes.empty")}</p>}
      {view !== null && view.matches.length > 0 && (
        <ul className="flex flex-col gap-2">
          {view.matches.map((match) => (
            <OutcomeRow
              key={match.code}
              match={match}
              names={view.names}
              suggestion={view.suggestion(match.code)}
              when={view.when(match)}
              onChange={onChange}
              client={client}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
