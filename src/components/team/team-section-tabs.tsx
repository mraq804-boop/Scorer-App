"use client";

import type { TeamSection } from "@/lib/app/team-sections";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type TeamSectionTabsProps = { sections: TeamSection[]; current: TeamSection; onSelect: (section: TeamSection) => void };

export function TeamSectionTabs({ sections, current, onSelect }: TeamSectionTabsProps) {
  return (
    <div role="tablist" aria-label={t("team.title")} className="-mx-4 flex border-b bg-card px-2">
      {sections.map((section) => (
        <button
          key={section}
          type="button"
          role="tab"
          aria-selected={section === current}
          onClick={() => onSelect(section)}
          className={cn(
            "press flex-1 border-b-3 px-2 py-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            section === current ? "border-haldi text-foreground" : "border-transparent text-muted-foreground",
          )}
        >
          {t(`team.section.${section}`)}
        </button>
      ))}
    </div>
  );
}
