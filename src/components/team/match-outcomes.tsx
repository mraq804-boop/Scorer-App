"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ShareImageLink } from "@/components/share/share-image-link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/i18n";
import { getLocalDb } from "@/lib/local/db";
import type { CachedTeam } from "@/lib/local/db";
import { removeLocalMatch } from "@/lib/local/matches";
import { aggregateTeamStats } from "@/lib/team";
import type { TeamPageData, TeamPageMatch } from "@/lib/team";
import { deleteMatch, fetchTeamPage, setPotm, setResultOverride } from "@/lib/team/remote";
import type { TeamError, TeamResult } from "@/lib/team/remote";
import { ConfirmDialog } from "./confirm-dialog";
import { FormAlert, SelectField, teamErrorMessage } from "./form";

type MatchOutcomesProps = { client: SupabaseClient; team: CachedTeam; onChanged: () => Promise<void> };

type Load = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; page: TeamPageData };

type OutcomeRowProps = {
  match: TeamPageMatch;
  names: ReadonlyMap<string, string>;
  suggestion: string | null;
  posterPlayer: string | null;
  when: string | null;
  onChange: (change: () => Promise<TeamResult<void>>) => Promise<string | undefined>;
  onDelete: () => void;
  client: SupabaseClient;
};

function outcomeError(error: TeamError): string {
  return error === "not_in_xi" ? t("team.error.notInXi") : teamErrorMessage(error);
}

function OutcomeRow({ match, names, suggestion, posterPlayer, when, onChange, onDelete, client }: OutcomeRowProps) {
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
      {counted && posterPlayer !== null && (
        <ShareImageLink
          href={`/m/${match.code}/poster/${posterPlayer}`}
          fileName={`poster-${match.code}.png`}
          className="h-11 self-start rounded-xl border-2 px-4 text-sm hover:bg-muted"
        >
          {t("share.potmPoster")}
        </ShareImageLink>
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
      <Button
        variant="ghost"
        disabled={busy}
        onClick={onDelete}
        aria-label={t("team.outcomes.deleteLabel", { title: match.title })}
        className="h-11 self-start rounded-xl px-3 text-base font-semibold text-destructive hover:bg-danger-soft hover:text-destructive"
      >
        <Trash2 className="size-5" aria-hidden />
        {t("team.outcomes.delete")}
      </Button>
    </li>
  );
}

export function MatchOutcomes({ client, team, onChanged }: MatchOutcomesProps) {
  const headingId = useId();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [deleting, setDeleting] = useState<TeamPageMatch | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

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
      posterPlayer: (match: TeamPageMatch) => {
        const chosen = match.potmPlayerId;
        if (chosen !== null && match.record?.xi.includes(chosen)) return chosen;
        return suggested[match.code]?.playerId ?? null;
      },
      when: (match: TeamPageMatch) => (match.record === null ? null : format.format(new Date(match.record.playedAt))),
    };
  }, [load]);

  const reload = async () => {
    const refreshed = await fetchTeamPage(client, team.code);
    if (refreshed.ok) setLoad({ kind: "ready", page: refreshed.value });
  };

  const onChange = async (call: () => Promise<TeamResult<void>>): Promise<string | undefined> => {
    const result = await call();
    if (!result.ok) return outcomeError(result.error);
    await reload();
    return undefined;
  };

  const onDeleted = async (code: string) => {
    setLoad((current) =>
      current.kind === "ready"
        ? { kind: "ready", page: { ...current.page, matches: current.page.matches.filter((match) => match.code !== code) } }
        : current,
    );
    await removeLocalMatch(getLocalDb(), code).catch(() => false);
    toast.success(t("team.outcomes.deleted"));
    void reload();
    void onChanged();
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-lg font-bold outline-none">
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
              posterPlayer={view.posterPlayer(match)}
              when={view.when(match)}
              onChange={onChange}
              onDelete={() => setDeleting(match)}
              client={client}
            />
          ))}
        </ul>
      )}
      {deleting !== null && (
        <ConfirmDialog
          title={t("team.outcomes.deleteTitle", { title: deleting.title })}
          body={t("team.outcomes.deleteBody")}
          confirmLabel={t("team.outcomes.delete")}
          onConfirm={() => deleteMatch(client, deleting.code)}
          onDone={() => onDeleted(deleting.code)}
          onClose={() => setDeleting(null)}
          fallbackFocus={() => headingRef.current?.focus()}
        />
      )}
    </section>
  );
}
