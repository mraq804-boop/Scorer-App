"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronLeft, LoaderCircle, LogIn } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { YourMatches } from "@/components/account/your-matches";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { startGoogleSignIn } from "@/lib/identity/google";
import { getLocalDb } from "@/lib/local/db";
import { siteUrl } from "@/lib/site-url";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

type View =
  | { kind: "loading" }
  | { kind: "guest"; client: SupabaseClient }
  | { kind: "member"; client: SupabaseClient; userId: string };

function useView(): View {
  const [view, setView] = useState<View>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    const client = createSupabaseBrowser();
    const settle = (next: View) => {
      if (active) setView(next);
    };
    client.auth
      .getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        settle(user === undefined || user.is_anonymous === true ? { kind: "guest", client } : { kind: "member", client, userId: user.id });
      })
      .catch(() => settle({ kind: "guest", client }));
    return () => {
      active = false;
    };
  }, []);
  return view;
}

function useReloadOnRestore(): void {
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
}

function SignInPrompt({ client }: { client: SupabaseClient }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await startGoogleSignIn(client, getLocalDb(), siteUrl());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-bold">{t("account.guest.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("home.keepHint")}</p>
      </div>
      {failed && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-destructive">
          {t("account.signInFailed")}
        </p>
      )}
      <Button disabled={busy} onClick={() => void signIn()} className="h-14 w-full rounded-2xl text-base font-semibold">
        {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <LogIn className="size-5" aria-hidden />}
        {t("account.signIn")}
      </Button>
    </section>
  );
}

function AccountContent() {
  const view = useView();
  useReloadOnRestore();
  const authFailed = useSearchParams().get("error") === "auth";
  return (
    <>
      {authFailed && (
        <p role="alert" className="rounded-2xl bg-danger-soft p-4 text-sm font-semibold text-destructive">
          {t("account.authFailed")}
        </p>
      )}
      {view.kind === "guest" && <SignInPrompt client={view.client} />}
      {view.kind === "member" && <YourMatches client={view.client} userId={view.userId} />}
    </>
  );
}

export default function AccountPage() {
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
        <h1 className="text-2xl font-bold">{t("account.title")}</h1>
      </header>
      <Suspense fallback={null}>
        <AccountContent />
      </Suspense>
    </main>
  );
}
