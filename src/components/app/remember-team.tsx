"use client";

import { useEffect } from "react";
import { LAST_TEAM_KEY, rememberTeamCode } from "@/lib/app/frame";

export function RememberTeam({ code }: { code: string }) {
  useEffect(() => {
    rememberTeamCode(LAST_TEAM_KEY, code);
  }, [code]);
  return null;
}
