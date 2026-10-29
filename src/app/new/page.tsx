import type { Metadata } from "next";
import { Suspense } from "react";
import { AppBar } from "@/components/app/app-bar";
import { GuestSession } from "@/components/guest-session";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { NewMatchForm } from "@/components/scoring/new-match-form";
import { TeamCacheRefresh } from "@/components/team/team-cache-refresh";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("home.newMatch") };

export default function NewMatchPage() {
  return (
    <>
      <AppBar title={t("home.newMatch")} heading close="/" />
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 bg-background px-4 pt-5">
        <Suspense fallback={null}>
          <NewMatchForm />
        </Suspense>
        <TeamCacheRefresh />
        <GuestSession />
        <PwaRegister />
      </main>
    </>
  );
}
