"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TakeOverDialog } from "@/components/account/take-over-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { completeClaim } from "@/lib/identity/google";
import { canTakeOver } from "@/lib/identity/takeover";
import { getLocalDb } from "@/lib/local/db";
import type { LocalMatch } from "@/lib/local/db";
import { getDeviceId } from "@/lib/local/matches";
import { cn } from "@/lib/utils";

type ServerMatch = {
  id: string;
  code: string;
  title: string;
  team_a: string;
  team_b: string;
  status: "in_progress" | "complete";
  summary: unknown;
  scoring_device: string;
  last_seq: number;
  updated_at: string;
};

type Account = { matches: ServerMatch[]; local: Map<string, LocalMatch>; deviceId: string };

type Failure = "claim" | "load" | null;

const COLUMNS = "id, code, title, team_a, team_b, status, summary, scoring_device, last_seq, updated_at";

async function loadAccount(client: SupabaseClient, userId: string): Promise<Account> {
  const { data, error } = await client
    .from("matches")
    .select(COLUMNS)
    .eq("owner_id", userId)
    .eq("visibility", "link")
    .order("updated_at", { ascending: false });
  if (error !== null) throw new Error(error.message);
  const db = getLocalDb();
  const [deviceId, local] = await Promise.all([getDeviceId(db), db.matches.toArray()]);
  return { matches: data as ServerMatch[], local: new Map(local.map((match) => [match.id, match])), deviceId };
}

function readSummary(summary: unknown): { lines: string[]; result: string | null } {
  const { lines, result } = (typeof summary === "object" && summary !== null ? summary : {}) as Record<string, unknown>;
  return {
    lines: Array.isArray(lines) ? lines.filter((line): line is string => typeof line === "string") : [],
    result: typeof result === "string" ? result : null,
  };
}

function StatusPill({ status }: { status: ServerMatch["status"] }) {
  const complete = status === "complete";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
      <span aria-hidden className={cn("size-2 rounded-full", complete ? "bg-success" : "bg-haldi")} />
      {t(complete ? "account.status.complete" : "account.status.in_progress")}
    </span>
  );
}

function AccountMatch({ match, takeOver, onTakeOver }: { match: ServerMatch; takeOver: boolean; onTakeOver: () => void }) {
  const { lines, result } = readSummary(match.summary);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 flex-1 truncate font-semibold">
            <bdi>{match.title}</bdi>
          </span>
          <StatusPill status={match.status} />
        </span>
        {lines.map((line, index) => (
          <span key={index} className="num block truncate text-sm">
            <bdi>{line}</bdi>
          </span>
        ))}
        {result !== null && (
          <span className="block truncate text-sm font-medium">
            <bdi>{result}</bdi>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button asChild variant="outline" className="h-12 rounded-xl text-base font-semibold">
          <a href={`/m/${match.code}`}>{t("account.openLive")}</a>
        </Button>
        {takeOver && (
          <Button onClick={onTakeOver} className="h-12 rounded-xl text-base font-semibold">
            {t("account.takeOver")}
          </Button>
        )}
      </div>
    </li>
  );
}

export function YourMatches({ client, userId }: { client: SupabaseClient; userId: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState<ServerMatch | null>(null);
  const started = useRef(false);

  const load = useCallback(async () => {
    let claimFailed = false;
    try {
      const moved = await completeClaim(client, getLocalDb());
      if (moved > 0) toast(t(moved === 1 ? "account.moved.one" : "account.moved.other", { n: moved }));
    } catch {
      claimFailed = true;
    }
    try {
      setAccount(await loadAccount(client, userId));
      setFailure(claimFailed ? "claim" : null);
    } catch {
      setFailure("load");
    }
    setLoading(false);
  }, [client, userId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  const retry = () => {
    setLoading(true);
    setFailure(null);
    void load();
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{t("home.matches")}</h2>
      {failure !== null && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-danger-soft p-4">
          <p className="min-w-0 text-sm leading-relaxed">{t(failure === "claim" ? "account.claimFailed" : "account.loadFailed")}</p>
          <Button variant="outline" disabled={loading} onClick={retry} className="h-12 rounded-xl text-base font-semibold">
            {t("account.retry")}
          </Button>
        </div>
      )}
      {account === null ? (
        loading && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("account.loading")}
          </p>
        )
      ) : account.matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("home.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {account.matches.map((match) => (
            <AccountMatch
              key={match.id}
              match={match}
              takeOver={canTakeOver(match, account.local.get(match.id), account.deviceId)}
              onTakeOver={() => setTaking(match)}
            />
          ))}
        </ul>
      )}
      {taking !== null && <TakeOverDialog client={client} match={taking} onClose={() => setTaking(null)} />}
    </section>
  );
}
