"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, LogIn } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { startGoogleSignIn } from "@/lib/identity/google";
import { getLocalDb } from "@/lib/local/db";
import { FormAlert } from "./form";

type SignInCardProps = {
  client: SupabaseClient;
  title: string;
  body: string;
  next: Parameters<typeof startGoogleSignIn>[3];
};

export function SignInCard({ client, title, body, next }: SignInCardProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await startGoogleSignIn(client, getLocalDb(), window.location.origin, next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {failed && <FormAlert message={t("account.signInFailed")} />}
      <Button disabled={busy} onClick={() => void signIn()} className="h-14 w-full rounded-2xl text-base font-semibold">
        {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <LogIn className="size-5" aria-hidden />}
        {t("account.signIn")}
      </Button>
    </section>
  );
}
