"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { Avatar } from "@/components/team-page/avatar";
import { MY_TEAM_KEY, rememberTeamCode } from "@/lib/app/frame";
import { colourFor, logoUrl } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { getLocalDb } from "@/lib/local/db";
import type { CachedTeam } from "@/lib/local/db";
import { getCachedTeam } from "@/lib/team/local";

async function loadTeam(): Promise<CachedTeam | null> {
  try {
    return (await getCachedTeam(getLocalDb())) ?? null;
  } catch {
    return null;
  }
}

export function HomeTitle() {
  const team = useLiveQuery(loadTeam);

  useEffect(() => {
    if (team !== undefined) rememberTeamCode(MY_TEAM_KEY, team?.code ?? null);
  }, [team]);

  if (team === undefined || team === null) return <bdi className="truncate">{t("app.name")}</bdi>;
  return (
    <>
      <Avatar
        name={team.name}
        url={logoUrl(team.code, team.logoVersion)}
        size={32}
        colour={colourFor(team.colour, team.name)}
        alt={t("brand.logoAlt", { name: team.name })}
        className="ring-2 ring-haldi"
      />
      <bdi className="truncate">{team.name}</bdi>
    </>
  );
}
