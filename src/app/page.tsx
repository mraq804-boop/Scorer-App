import { ChevronRight, Plus } from "lucide-react";
import { GuestSession } from "@/components/guest-session";
import { MatchList } from "@/components/match-list";
import { InstallApp } from "@/components/pwa/install-app";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { TeamCacheRefresh } from "@/components/team/team-cache-refresh";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{t("app.name")}</h1>
        <p className="text-muted-foreground">{t("home.tagline")}</p>
      </header>

      <Button asChild className="h-14 w-full rounded-2xl text-base font-semibold">
        <a href="/new">
          <Plus aria-hidden />
          {t("home.newMatch")}
        </a>
      </Button>

      <MatchList />

      <a
        href="/account"
        className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border bg-card p-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">{t("home.keep")}</span>
          <span className="text-sm text-muted-foreground">{t("home.keepHint")}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
      </a>

      <InstallApp />
      <TeamCacheRefresh />
      <GuestSession />
      <PwaRegister />
    </main>
  );
}
