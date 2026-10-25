import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { GuestSession } from "@/components/guest-session";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { NewMatchForm } from "@/components/scoring/new-match-form";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("home.newMatch") };

export default function NewMatchPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-4">
      <header className="flex items-center gap-2">
        <a
          href="/"
          aria-label={t("common.back")}
          className="-ms-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-6 rtl:rotate-180" aria-hidden />
        </a>
        <h1 className="text-2xl font-bold">{t("home.newMatch")}</h1>
      </header>
      <NewMatchForm />
      <GuestSession />
      <PwaRegister />
    </main>
  );
}
