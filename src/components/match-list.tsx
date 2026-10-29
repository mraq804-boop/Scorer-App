"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { MatchActions } from "@/components/match-actions";
import { StorageError } from "@/components/storage-error";
import { OutcomePill } from "@/components/team-page/match-list";
import { matchSection, onlineCopy, teamPill } from "@/lib/app/home";
import type { TeamPill } from "@/lib/app/home";
import type { MatchOutcome } from "@/lib/i18n/team";
import { t } from "@/lib/i18n";
import { checkStorage, getLocalDb } from "@/lib/local/db";
import type { LocalMatch } from "@/lib/local/db";
import { backfillWinners } from "@/lib/local/matches";

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const OUTCOMES: Record<TeamPill, MatchOutcome> = { W: "won", L: "lost", T: "tied", NR: "noResult" };

async function loadMatches(): Promise<LocalMatch[] | null> {
  try {
    return await getLocalDb().matches.orderBy("updatedAt").reverse().toArray();
  } catch {
    return null;
  }
}

function useStorageUnavailable(): boolean {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    void checkStorage().then((check) => {
      if (active) setUnavailable(!check.ok && check.reason === "unavailable");
    });
    return () => {
      active = false;
    };
  }, []);
  return unavailable;
}

function SyncStatus({ match }: { match: LocalMatch }) {
  const saved = onlineCopy(match) !== "full";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
      <span aria-hidden className={saved ? "size-2 rounded-full bg-haldi" : "size-2 rounded-full bg-success"} />
      {saved ? t("sync.saved") : t("sync.synced")}
    </span>
  );
}

export function MatchCard({ match, live }: { match: LocalMatch; live: boolean }) {
  const pill = teamPill(match);
  return (
    <li className="relative">
      <a
        href={`/score?m=${match.id}`}
        className="press flex items-center gap-3 rounded-2xl border bg-card p-4 pe-14 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {pill !== null && <OutcomePill outcome={OUTCOMES[pill]} />}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-start justify-between gap-3">
            {live && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-white">
                <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-white" />
                {t("share.liveBadge")}
              </span>
            )}
            <bdi className="min-w-0 flex-1 truncate font-semibold">{match.title}</bdi>
            <SyncStatus match={match} />
          </span>
          {match.summary.lines.map((line, index) => (
            <span key={index} className="num block truncate text-sm">
              {line}
            </span>
          ))}
          {match.summary.result !== null && <span className="block truncate text-sm font-medium">{match.summary.result}</span>}
          <time dateTime={match.updatedAt} className="text-xs text-muted-foreground">
            {dateFormat.format(new Date(match.updatedAt))}
          </time>
        </span>
      </a>
      <MatchActions match={match} />
    </li>
  );
}

function MatchSection({ id, title, matches, live }: { id: string; title: string; matches: LocalMatch[]; live: boolean }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <ul className="flex flex-col gap-3">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} live={live} />
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-card px-6 py-10 text-center">
      <h2 className="text-xl font-bold">{t("home.empty.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("home.empty.body")}</p>
      <a
        href="/new"
        className="press mt-1 inline-flex h-12 items-center gap-2 rounded-2xl bg-haldi px-5 font-bold text-[#412402] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-5" aria-hidden />
        {t("home.empty.cta")}
      </a>
    </section>
  );
}

export function MatchList() {
  const matches = useLiveQuery(loadMatches);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void backfillWinners(getLocalDb()).catch(() => undefined);
  }, []);
  const unavailable = useStorageUnavailable();
  if (unavailable || matches === null) return <StorageError />;
  if (matches === undefined) return null;
  if (matches.length === 0) return <EmptyState />;
  const live = matches.filter((match) => matchSection(match, now) === "live");
  const recent = matches.filter((match) => matchSection(match, now) === "recent");
  return (
    <>
      {live.length > 0 && <MatchSection id="home-live" title={t("home.live")} matches={live} live />}
      {recent.length > 0 && <MatchSection id="home-recent" title={t("home.recent")} matches={recent} live={false} />}
    </>
  );
}
