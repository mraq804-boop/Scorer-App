"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { StorageError } from "@/components/storage-error";
import { t } from "@/lib/i18n";
import { checkStorage, getLocalDb } from "@/lib/local/db";
import type { LocalMatch } from "@/lib/local/db";

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

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
  return (
    <li>
      <a
        href={`/score?m=${match.id}`}
        className="flex flex-col gap-1.5 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 flex-1 truncate font-semibold">
            {match.title}
          </span>
          <SyncStatus match={match} />
        </span>
        {match.summary.lines.map((line, index) => (
          <span key={index} className="num block truncate text-sm">
            {line}
          </span>
        ))}
        {match.summary.result !== null && (
          <span className="block truncate text-sm font-medium">
            {match.summary.result}
          </span>
        )}
        <time dateTime={match.updatedAt} className="text-xs text-muted-foreground">
          {dateFormat.format(new Date(match.updatedAt))}
        </time>
      </a>
    </li>
  );
}

export function MatchList() {
  const matches = useLiveQuery(loadMatches);
  const unavailable = useStorageUnavailable();
  if (unavailable || matches === null) return <StorageError />;
  if (matches === undefined) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{t("home.matches")}</h2>
      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("home.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((match) => (
            <MatchItem key={match.id} match={match} />
          ))}
        </ul>
      )}
    </section>
  );
}
