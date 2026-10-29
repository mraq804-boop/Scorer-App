import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { AppBar } from "@/components/app/app-bar";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { t } from "@/lib/i18n";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: t("offline.title") };

export default function OfflinePage() {
  return (
    <>
      <AppBar title={t("app.name")} />
      <main data-offline-page className="grid min-h-[calc(100dvh-3.5rem)] place-items-center px-6">
        <div className="flex max-w-sm flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-full bg-accent text-accent-foreground">
            <WifiOff className="size-7" aria-hidden />
          </span>
          <h1 className="mt-5 font-heading text-2xl font-bold">{t("offline.title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("offline.body")}</p>
          <RetryButton />
          <a href="/" className="mt-4 text-sm font-semibold underline underline-offset-4">
            {t("offline.home")}
          </a>
        </div>
        <PwaRegister />
      </main>
    </>
  );
}
