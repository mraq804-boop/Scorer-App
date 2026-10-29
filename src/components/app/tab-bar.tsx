"use client";

import { BarChart3, Home, Plus, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { TEAM_CODES_EVENT, readTeamCodes, safeLocalStorage, showsTabBar, statsHref, tabForPath } from "@/lib/app/frame";
import type { TabKey } from "@/lib/app/frame";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(TEAM_CODES_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(TEAM_CODES_EVENT, onChange);
  };
}

function useStatsHref(): string {
  return useSyncExternalStore(
    subscribe,
    () => statsHref(readTeamCodes(safeLocalStorage())),
    () => "/team",
  );
}

function onOfflinePage(): boolean {
  return typeof document !== "undefined" && document.querySelector("[data-offline-page]") !== null;
}

type Tab = { key: Exclude<TabKey, "new">; href: string; label: MessageKey; icon: LucideIcon };

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <a
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "press flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] leading-tight font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-6", active && "text-haldi")} aria-hidden strokeWidth={active ? 2.4 : 2} />
      <span className="truncate">{t(tab.label)}</span>
    </a>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const stats = useStatsHref();
  if (!showsTabBar(pathname) || onOfflinePage()) return null;
  const active = tabForPath(pathname);
  const left: Tab[] = [
    { key: "home", href: "/", label: "tabs.home", icon: Home },
    { key: "team", href: "/team", label: "tabs.team", icon: Users },
  ];
  const right: Tab[] = [
    { key: "stats", href: stats, label: "tabs.stats", icon: BarChart3 },
    { key: "account", href: "/account", label: "tabs.account", icon: User },
  ];
  return (
    <nav
      data-tab-bar
      aria-label={t("tabs.label")}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex h-17 w-full max-w-md items-center gap-1 px-2">
        {left.map((tab) => (
          <TabLink key={tab.key} tab={tab} active={active === tab.key} />
        ))}
        <div className="flex flex-1 justify-center">
          <a
            href="/new"
            aria-label={t("tabs.new")}
            className="press -mt-7 grid size-14 place-items-center rounded-full border-4 border-card bg-haldi text-[#412402] shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Plus className="size-7" aria-hidden strokeWidth={2.6} />
          </a>
        </div>
        {right.map((tab) => (
          <TabLink key={tab.key} tab={tab} active={active === tab.key} />
        ))}
      </div>
    </nav>
  );
}
