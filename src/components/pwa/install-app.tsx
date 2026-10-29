"use client";

import { ChevronRight, Download, Share, SquarePlus } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { safeLocalStorage } from "@/lib/app/frame";
import { INSTALL_DISMISSED_KEY, installCardVisible, readDismissedAt } from "@/lib/app/install";
import { t } from "@/lib/i18n";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const standaloneQuery = "(display-mode: standalone)";

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function subscribePrompt(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

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

export function useInstallPrompt() {
  const installed = useInstalled();
  const ios = useIsIos();
  const prompt = useSyncExternalStore(subscribePrompt, () => deferred, () => null);
  const [stepsOpen, setStepsOpen] = useState(false);

  const install = async () => {
    if (prompt === null) {
      setStepsOpen(true);
      return;
    }
    deferred = null;
    notify();
    await prompt.prompt();
    await prompt.userChoice;
  };

  return { available: !installed && (prompt !== null || ios), ios, install, stepsOpen, setStepsOpen };
}

function IosSteps({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t("pwa.installIos.title")}</DrawerTitle>
          <DrawerDescription>{t("pwa.installIos.hint")}</DrawerDescription>
        </DrawerHeader>
        <ol className="flex flex-col gap-3 px-4 pb-8 text-sm">
          <li className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
              <Share className="size-4" aria-hidden />
            </span>
            {t("pwa.installIos.share")}
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
              <SquarePlus className="size-4" aria-hidden />
            </span>
            {t("pwa.installIos.add")}
          </li>
        </ol>
      </DrawerContent>
    </Drawer>
  );
}

function saveDismissal(now: number) {
  try {
    safeLocalStorage()?.setItem(INSTALL_DISMISSED_KEY, String(now));
  } catch {
    return;
  }
}

function useDismissal() {
  const [visible, setVisible] = useState(() => installCardVisible(readDismissedAt(safeLocalStorage()), Date.now()));
  const dismiss = () => {
    saveDismissal(Date.now());
    setVisible(false);
  };
  return { visible, dismiss };
}

export function InstallCard() {
  const { available, install, stepsOpen, setStepsOpen } = useInstallPrompt();
  const { visible, dismiss } = useDismissal();
  if (!available || !visible) return null;
  return (
    <section
      aria-labelledby="install-card-title"
      className="flex flex-col gap-3 rounded-2xl border border-haldi/40 bg-haldi/10 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-haldi text-[#412402]">
          <Download className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="install-card-title" className="font-bold">
            {t("pwa.card.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("pwa.card.body")}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void install()}
          className="press h-11 flex-1 rounded-xl bg-haldi px-4 text-sm font-bold text-[#412402] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("pwa.install")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="press h-11 rounded-xl px-4 text-sm font-semibold text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("pwa.card.dismiss")}
        </button>
      </div>
      <IosSteps open={stepsOpen} onOpenChange={setStepsOpen} />
    </section>
  );
}

export function InstallRow() {
  const { available, install, stepsOpen, setStepsOpen } = useInstallPrompt();
  if (!available) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => void install()}
        className="press flex min-h-14 w-full items-center gap-3 px-4 text-start outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Download className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1 font-semibold">{t("pwa.card.title")}</span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
      </button>
      <IosSteps open={stepsOpen} onOpenChange={setStepsOpen} />
    </>
  );
}

export function InstallIcon() {
  const { available, install, stepsOpen, setStepsOpen } = useInstallPrompt();
  if (!available) return null;
  return (
    <>
      <button
        type="button"
        aria-label={t("pwa.card.title")}
        onClick={() => void install()}
        className="press grid size-11 place-items-center rounded-full text-haldi outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-haldi/60"
      >
        <Download className="size-5" aria-hidden />
      </button>
      <IosSteps open={stepsOpen} onOpenChange={setStepsOpen} />
    </>
  );
}
