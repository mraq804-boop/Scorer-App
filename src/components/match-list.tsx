"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { StorageError } from "@/components/storage-error";
import { matchSection, teamPill } from "@/lib/app/home";
import type { TeamPill } from "@/lib/app/home";
import { t } from "@/lib/i18n";
import { checkStorage, getLocalDb } from "@/lib/local/db";
import type { LocalMatch } from "@/lib/local/db";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const PILL_STYLES: Record<TeamPill, string> = {
  W: "bg-success text-white",
  L: "bg-destructive text-white",
  T: "bg-muted text-foreground",
  NR: "bg-muted text-muted-foreground",
};

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
  const saved = match.syncedSeq < match.lastSeq;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
      <span aria-hidden className={saved ? "size-2 rounded-full bg-haldi" : "size-2 rounded-full bg-success"} />
      {saved ? t("sync.saved") : t("sync.synced")}
    </span>
  );
}

function MatchItem({ match }: { match: LocalMatch }) {
  const pill = teamPill(match);
  const live = matchSection(match) === "live";
  return (
    <li>
      <a
        href={`/score?m=${match.id}`}
        className="press flex items-center gap-3 rounded-2xl border bg-card p-4 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {pill !== null && (
          <span className={cn("grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-2 text-xs font-bold", PILL_STYLES[pill])}>
            {pill}
          </span>
        )}
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
        <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
      </a>
    </li>
  );
}

function MatchSection({ id, title, matches }: { id: string; title: string; matches: LocalMatch[] }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <ul className="flex flex-col gap-3">
        {matches.map((match) => (
          <MatchItem key={match.id} match={match} />
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
  const unavailable = useStorageUnavailable();
  if (unavailable || matches === null) return <StorageError />;
  if (matches === undefined) return null;
  if (matches.length === 0) return <EmptyState />;
  const live = matches.filter((match) => matchSection(match) === "live");
  const recent = matches.filter((match) => matchSection(match) === "recent");
  return (
    <>
      {live.length > 0 && <MatchSection id="home-live" title={t("home.live")} matches={live} />}
      {recent.length > 0 && <MatchSection id="home-recent" title={t("home.recent")} matches={recent} />}
    </>
  );
}
