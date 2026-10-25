"use client";

import { Download, Share, SquarePlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { t } from "@/lib/i18n";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const standaloneQuery = "(display-mode: standalone)";

function subscribeStandalone(onChange: () => void) {
  const query = window.matchMedia(standaloneQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useInstalled() {
  return useSyncExternalStore(
    subscribeStandalone,
    () => window.matchMedia(standaloneQuery).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => true,
  );
}

function useIsIos() {
  return useSyncExternalStore(
    () => () => undefined,
    () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    () => false,
  );
}

export function InstallApp() {
  const installed = useInstalled();
  const ios = useIsIos();
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!deferred && !ios)) return null;

  async function install() {
    if (!deferred) {
      setShowIosSteps((open) => !open);
      return;
    }
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={install}
        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-haldi/50 px-4 text-sm font-semibold text-foreground"
      >
        <Download className="size-4" aria-hidden />
        {t("pwa.install")}
      </button>
      {showIosSteps && !deferred && (
        <div className="rounded-xl bg-muted p-4">
          <p className="font-semibold">{t("pwa.installIos.title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("pwa.installIos.hint")}</p>
          <ol className="mt-3 flex flex-col gap-3 text-sm">
            <li className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background">
                <Share className="size-4" aria-hidden />
              </span>
              {t("pwa.installIos.share")}
            </li>
            <li className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background">
                <SquarePlus className="size-4" aria-hidden />
              </span>
              {t("pwa.installIos.add")}
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
