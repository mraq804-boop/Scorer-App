"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreateTeam } from "@/components/team/create-team";
import { FixturesEditor } from "@/components/team/fixtures-editor";
import { FormAlert } from "@/components/team/form";
import { MatchOutcomes } from "@/components/team/match-outcomes";
import { ScorersEditor } from "@/components/team/scorers-editor";
import { SeasonsEditor } from "@/components/team/seasons-editor";
import { SignInCard } from "@/components/team/sign-in-card";
import { ShareLink } from "@/components/team/share-link";
import { SquadEditor } from "@/components/team/squad-editor";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { getLocalDb } from "@/lib/local/db";
import type { CachedTeam } from "@/lib/local/db";
import { teamUrl } from "@/lib/site-url";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { TeamRemoteError, refreshTeamCache } from "@/lib/team/remote";

type View =
  | { kind: "loading" }
  | { kind: "guest"; client: SupabaseClient }
  | { kind: "failed"; client: SupabaseClient }
  | { kind: "none"; client: SupabaseClient }
  | { kind: "team"; client: SupabaseClient; team: CachedTeam };

async function loadView(client: SupabaseClient): Promise<View> {
  try {
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    if (user === undefined || user.is_anonymous === true) return { kind: "guest", client };
    const team = await refreshTeamCache(client, getLocalDb());
    return team === null ? { kind: "none", client } : { kind: "team", client, team };
  } catch (error) {
    if (error instanceof TeamRemoteError && error.code === "not_signed_in") return { kind: "guest", client };
    return { kind: "failed", client };
  }
}

function TeamHeader({ team }: { team: CachedTeam }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="truncate text-xl font-bold">
        <bdi>{team.name}</bdi>
      </h2>
      {team.homeGround !== null && (
        <p className="truncate text-sm text-muted-foreground">
          <bdi>{team.homeGround}</bdi>
        </p>
      )}
      {team.role === "scorer" && <p className="text-sm font-semibold text-muted-foreground">{t("team.role.scorer")}</p>}
    </section>
  );
}

function PublicLink({ team }: { team: CachedTeam }) {
  const url = teamUrl(team.code);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">{t("team.link.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("team.link.body")}</p>
      </div>
      <ShareLink url={url} text={t("team.link.shareText", { name: team.name, url })} testId="team-link" />
    </section>
  );
}

function TeamContent() {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void loadView(createSupabaseBrowser()).then((next) => {
      if (active) setView(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const retry = async (client: SupabaseClient) => {
    setView({ kind: "loading" });
    setView(await loadView(client));
  };

  const refresh = async (client: SupabaseClient) => {
    try {
      const team = await refreshTeamCache(client, getLocalDb());
      setView(team === null ? { kind: "none", client } : { kind: "team", client, team });
    } catch {
      toast.error(t("team.refreshFailed"));
    }
  };

  switch (view.kind) {
    case "loading":
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {t("team.loading")}
        </p>
      );
    case "guest":
      return <SignInCard client={view.client} title={t("team.guest.title")} body={t("team.guest.body")} next="/team" />;
    case "failed":
      return (
        <div className="flex flex-col gap-3">
          <FormAlert message={t("team.loadFailed")} />
          <Button variant="outline" onClick={() => void retry(view.client)} className="h-12 rounded-xl text-base">
            {t("account.retry")}
          </Button>
        </div>
      );
    case "none":
      return <CreateTeam client={view.client} onCreated={() => refresh(view.client)} />;
    case "team": {
      const { client, team } = view;
      const onChanged = () => refresh(client);
      const owner = team.role === "owner";
      return (
        <>
          <TeamHeader team={team} />
          {owner && <PublicLink team={team} />}
          <FixturesEditor client={client} team={team} onChanged={onChanged} />
          {owner && <MatchOutcomes client={client} team={team} />}
          <SquadEditor client={client} team={team} onChanged={onChanged} />
          {owner && <SeasonsEditor client={client} team={team} onChanged={onChanged} />}
          {owner && <ScorersEditor client={client} team={team} />}
        </>
      );
    }
  }
}

export default function TeamPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-4 pb-8">
      <header className="flex items-center gap-2">
        <a
          href="/"
          aria-label={t("common.back")}
          className="-ms-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-6 rtl:rotate-180" aria-hidden />
        </a>
        <h1 className="text-2xl font-bold">{t("team.title")}</h1>
      </header>
      <TeamContent />
    </main>
  );
}
