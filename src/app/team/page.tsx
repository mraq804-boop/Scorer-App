"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Pencil } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppBar } from "@/components/app/app-bar";
import { ShareLinkButton } from "@/components/app/share-link-button";
import { Avatar } from "@/components/team-page/avatar";
import { BrandEditor } from "@/components/team/brand-editor";
import { CreateTeam, EditTeam } from "@/components/team/create-team";
import { FixturesEditor } from "@/components/team/fixtures-editor";
import { FormAlert } from "@/components/team/form";
import { MatchOutcomes } from "@/components/team/match-outcomes";
import { ScorersEditor } from "@/components/team/scorers-editor";
import { SeasonsEditor } from "@/components/team/seasons-editor";
import { SignInCard } from "@/components/team/sign-in-card";
import { ShareLink } from "@/components/team/share-link";
import { SquadEditor } from "@/components/team/squad-editor";
import { TeamSectionTabs } from "@/components/team/team-section-tabs";
import { Button } from "@/components/ui/button";
import { MY_TEAM_KEY, rememberTeamCode } from "@/lib/app/frame";
import { sectionFromQuery, sectionsFor } from "@/lib/app/team-sections";
import type { TeamSection } from "@/lib/app/team-sections";
import { colourFor, logoUrl } from "@/lib/brand";
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

function TeamHeader({ team, onEdit }: { team: CachedTeam; onEdit?: () => void }) {
  return (
    <section className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="truncate text-xl font-bold">
          <bdi>{team.name}</bdi>
        </h2>
        {team.homeGround !== null && (
          <p className="truncate text-sm text-muted-foreground">
            <bdi>{team.homeGround}</bdi>
          </p>
        )}
        <p className="text-sm text-muted-foreground">{t("team.fixtures.timeZone", { zone: team.timeZone })}</p>
        {team.role === "scorer" && <p className="text-sm font-semibold text-muted-foreground">{t("team.role.scorer")}</p>}
      </div>
      {onEdit !== undefined && (
        <Button type="button" variant="outline" onClick={onEdit} className="h-11 shrink-0 rounded-xl px-4 text-base">
          <Pencil className="size-4" aria-hidden />
          {t("team.edit")}
        </Button>
      )}
    </section>
  );
}

function OwnerHeader({ client, team, onChanged }: { client: SupabaseClient; team: CachedTeam; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  if (!editing) return <TeamHeader team={team} onEdit={() => setEditing(true)} />;
  return (
    <EditTeam
      client={client}
      team={team}
      onCancel={() => setEditing(false)}
      onSaved={async () => {
        setEditing(false);
        await onChanged();
      }}
    />
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

function TeamSummary({ team }: { team: CachedTeam }) {
  return (
    <section className="flex items-center gap-3">
      <Avatar
        name={team.name}
        url={logoUrl(team.code, team.logoVersion)}
        size={52}
        colour={colourFor(team.colour, team.name)}
        alt={t("brand.logoAlt", { name: team.name })}
        className="ring-3 ring-haldi"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="truncate text-xl font-bold">
          <bdi>{team.name}</bdi>
        </h2>
        {team.homeGround !== null && (
          <p className="truncate text-sm text-muted-foreground">
            <bdi>{team.homeGround}</bdi>
          </p>
        )}
        {team.role === "scorer" && <p className="text-sm font-semibold text-muted-foreground">{t("team.role.scorer")}</p>}
      </div>
    </section>
  );
}

function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="h-14 animate-pulse rounded-2xl bg-muted" />
      <div className="h-12 animate-pulse rounded-2xl bg-muted" />
      <div className="h-48 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function TeamSections({ client, team, onChanged }: { client: SupabaseClient; team: CachedTeam; onChanged: () => Promise<void> }) {
  const section = sectionFromQuery(useSearchParams().get("section"), team.role);
  const owner = team.role === "owner";
  const select = (next: TeamSection) => {
    if (next !== section) window.history.pushState(null, "", `/team?section=${next}`);
  };
  return (
    <>
      <TeamSummary team={team} />
      <TeamSectionTabs sections={sectionsFor(team.role)} current={section} onSelect={select} />
      {section === "squad" && <SquadEditor client={client} team={team} onChanged={onChanged} />}
      {section === "fixtures" && <FixturesEditor client={client} team={team} onChanged={onChanged} />}
      {section === "results" && owner && <MatchOutcomes client={client} team={team} />}
      {section === "settings" && owner && (
        <>
          <OwnerHeader client={client} team={team} onChanged={onChanged} />
          <BrandEditor client={client} team={team} onChanged={onChanged} />
          <PublicLink team={team} />
          <SeasonsEditor client={client} team={team} onChanged={onChanged} />
          <ScorersEditor client={client} team={team} />
        </>
      )}
    </>
  );
}

function TeamScreen() {
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

  useEffect(() => {
    if (view.kind === "team") rememberTeamCode(MY_TEAM_KEY, view.team.code);
    if (view.kind === "none") rememberTeamCode(MY_TEAM_KEY, null);
  }, [view]);

  const refresh = async (client: SupabaseClient) => {
    try {
      const team = await refreshTeamCache(client, getLocalDb());
      setView(team === null ? { kind: "none", client } : { kind: "team", client, team });
    } catch {
      toast.error(t("team.refreshFailed"));
    }
  };

  const team = view.kind === "team" ? view.team : null;
  return (
    <>
      <AppBar
        title={t("team.title")}
        heading
        actions={team === null ? undefined : <ShareLinkButton url={teamUrl(team.code)} title={team.name} />}
      />
      <main className="app-screen mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-5 pb-8">
        <TeamBody view={view} retry={retry} refresh={refresh} />
      </main>
    </>
  );
}

type TeamBodyProps = {
  view: View;
  retry: (client: SupabaseClient) => Promise<void>;
  refresh: (client: SupabaseClient) => Promise<void>;
};

function TeamBody({ view, retry, refresh }: TeamBodyProps) {
  switch (view.kind) {
    case "loading":
      return <Loading />;
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
    case "team":
      return <TeamSections client={view.client} team={view.team} onChanged={() => refresh(view.client)} />;
  }
}

export default function TeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamScreen />
    </Suspense>
  );
}
