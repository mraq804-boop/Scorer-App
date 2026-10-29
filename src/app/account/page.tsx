"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, LogIn, User } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Appearance } from "@/components/account/appearance";
import { YourMatches } from "@/components/account/your-matches";
import { AppBar } from "@/components/app/app-bar";
import { Copyright } from "@/components/copyright";
import { InstallRow } from "@/components/pwa/install-app";
import { Button } from "@/components/ui/button";
import { displayName } from "@/lib/app/account";
import { initials } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { startGoogleSignIn } from "@/lib/identity/google";
import { getLocalDb } from "@/lib/local/db";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

type View =
  | { kind: "loading" }
  | { kind: "guest"; client: SupabaseClient }
  | { kind: "member"; client: SupabaseClient; userId: string; name: string | null };

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
        settle(
          user === undefined || user.is_anonymous === true
            ? { kind: "guest", client }
            : { kind: "member", client, userId: user.id, name: displayName(user.user_metadata) },
        );
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
      await startGoogleSignIn(client, getLocalDb(), window.location.origin);
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

function Profile({ view }: { view: Exclude<View, { kind: "loading" }> }) {
  const name = view.kind === "member" ? view.name : null;
  const title = view.kind === "guest" ? t("account.guestName") : (name ?? t("account.googleUser"));
  return (
    <section className="flex items-center gap-4 rounded-3xl bg-[#1b2340] p-5 text-white">
      <span className="grid size-14 shrink-0 place-items-center rounded-full bg-haldi text-xl font-extrabold text-[#412402]">
        {name !== null ? initials(name) : view.kind === "guest" ? <LogIn className="size-6" aria-hidden /> : <User className="size-6" aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <bdi className="truncate text-xl font-bold">{title}</bdi>
        {name !== null && <span className="text-sm text-white/70">{t("account.googleUser")}</span>}
      </span>
    </section>
  );
}

function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="h-40 animate-pulse rounded-2xl bg-muted" />
    </div>
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
      {view.kind === "loading" ? <Loading /> : <Profile view={view} />}
      {view.kind === "guest" && <SignInPrompt client={view.client} />}
      {view.kind === "member" && <YourMatches client={view.client} userId={view.userId} />}
      <section className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
        <InstallRow />
        <Appearance />
      </section>
    </>
  );
}

export default function AccountPage() {
  return (
    <>
      <AppBar title={t("account.title")} heading />
      <main className="app-screen mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-5 pb-8">
        <Suspense fallback={<Loading />}>
          <AccountContent />
        </Suspense>
        <Copyright />
      </main>
    </>
  );
}
