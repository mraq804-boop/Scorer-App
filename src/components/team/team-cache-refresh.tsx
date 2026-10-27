"use client";

import { useEffect } from "react";
import { getLocalDb } from "@/lib/local/db";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { refreshTeamCacheInBackground } from "@/lib/team/remote";

export function TeamCacheRefresh() {
  useEffect(() => {
    if (!navigator.onLine) return;
    let client: ReturnType<typeof createSupabaseBrowser>;
    try {
      client = createSupabaseBrowser();
    } catch {
      return;
    }
    void refreshTeamCacheInBackground(client, getLocalDb());
  }, []);
  return null;
}
