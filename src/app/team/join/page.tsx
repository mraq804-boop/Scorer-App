"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AppBar } from "@/components/app/app-bar";
import { FormAlert } from "@/components/team/form";
import { SignInCard } from "@/components/team/sign-in-card";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { getLocalDb } from "@/lib/local/db";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { acceptScorerInvite, refreshTeamCache } from "@/lib/team/remote";
import type { TeamError } from "@/lib/team/remote";

type View =
  | { kind: "joining" }
  | { kind: "guest"; client: SupabaseClient }
  | { kind: "failed"; client: SupabaseClient; message: string; retry: boolean }
  | { kind: "joined"; name: string | null };

function failure(client: SupabaseClient, error: TeamError): View {
  if (error === "not_signed_in") return { kind: "guest", client };
  if (error === "invite_invalid") return { kind: "failed", client, message: t("join.invalid"), retry: false };
  if (error === "quota_exceeded") return { kind: "failed", client, message: t("join.full"), retry: false };
  return { kind: "failed", client, message: t("join.failed"), retry: true };
}

async function teamName(client: SupabaseClient, code: string): Promise<string | null> {
  try {
    const team = await refreshTeamCache(client, getLocalDb());
    return team?.code === code ? team.name : null;
  } catch {
    return null;
  }
}

async function join(client: SupabaseClient, token: string): Promise<View> {
  try {
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    if (user === undefined || user.is_anonymous === true) return { kind: "guest", client };
  } catch {
    return failure(client, "network");
  }
  const result = await acceptScorerInvite(client, token);
  if (!result.ok) return failure(client, result.error);
  return { kind: "joined", name: await teamName(client, result.value) };
}

function Joined({ name }: { name: string | null }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-bold">
          {name === null ? t("team.role.scorer") : <bdi>{t("join.done.title", { name })}</bdi>}
        </h2>
        <p className="text-sm text-muted-foreground">{t("join.done.body")}</p>
      </div>
      <Button asChild className="h-14 w-full rounded-2xl text-base font-semibold">
        <a href="/new">
          <Plus className="size-5" aria-hidden />
          {t("join.done.start")}
        </a>
      </Button>
      <Button asChild variant="outline" className="h-12 w-full rounded-xl text-base">
        <a href="/team">{t("join.done.team")}</a>
      </Button>
    </section>
  );
}

function JoinFlow({ token }: { token: string }) {
  const [view, setView] = useState<View>({ kind: "joining" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void join(createSupabaseBrowser(), token).then(setView);
  }, [token]);

  const retry = async (client: SupabaseClient) => {
    setView({ kind: "joining" });
    setView(await join(client, token));
  };

  switch (view.kind) {
    case "joining":
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {t("join.joining")}
        </p>
      );
    case "guest":
      return (
        <SignInCard
          client={view.client}
          title={t("join.guest.title")}
          body={t("join.guest.body")}
          next={`/team/join?token=${encodeURIComponent(token)}`}
        />
      );
    case "failed":
      return (
        <div className="flex flex-col gap-3">
          <FormAlert message={view.message} />
          {view.retry && (
            <Button variant="outline" onClick={() => void retry(view.client)} className="h-12 rounded-xl text-base">
              {t("account.retry")}
            </Button>
          )}
        </div>
      );
    case "joined":
      return <Joined name={view.name} />;
  }
}

function JoinContent() {
  const token = useSearchParams().get("token");
  if (token === null || token === "") return <FormAlert message={t("join.invalid")} />;
  return <JoinFlow token={token} />;
}

export default function JoinPage() {
  return (
    <>
      <AppBar title={t("join.title")} heading back="/" />
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-5 pb-8">
        <Suspense fallback={null}>
          <JoinContent />
        </Suspense>
      </main>
    </>
  );
}
