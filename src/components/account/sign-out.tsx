"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/team/confirm-dialog";
import { t } from "@/lib/i18n";
import { signOutHere } from "@/lib/identity/session";
import { getLocalDb } from "@/lib/local/db";
import type { TeamResult } from "@/lib/team/remote";

async function signOut(client: SupabaseClient): Promise<TeamResult<void>> {
  return (await signOutHere(client, getLocalDb())) ? { ok: true, value: undefined } : { ok: false, error: "network" };
}

export function SignOutRow({ client }: { client: SupabaseClient }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="press flex min-h-14 w-full items-center gap-3 px-4 text-start outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <LogOut className="size-5 shrink-0 text-destructive rtl:rotate-180" aria-hidden />
        <span className="flex-1 font-semibold text-destructive">{t("account.signOut")}</span>
      </button>
      {confirming && (
        <ConfirmDialog
          title={t("account.signOutTitle")}
          body={t("account.signOutBody")}
          confirmLabel={t("account.signOut")}
          onConfirm={() => signOut(client)}
          onDone={async () => window.location.reload()}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
