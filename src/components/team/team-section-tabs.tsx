"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { nextSection } from "@/lib/app/team-sections";
import type { TeamSection } from "@/lib/app/team-sections";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const SECTION_PANEL_ID = "team-section-panel";

export function sectionTabId(section: TeamSection): string {
  return `team-tab-${section}`;
}

type TeamSectionTabsProps = { sections: TeamSection[]; current: TeamSection; onSelect: (section: TeamSection) => void };

export function TeamSectionTabs({ sections, current, onSelect }: TeamSectionTabsProps) {
  const list = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = nextSection(sections, current, event.key);
    if (target === null) return;
    event.preventDefault();
    onSelect(target);
    list.current?.querySelector<HTMLButtonElement>(`#${sectionTabId(target)}`)?.focus();
  };

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={t("team.title")}
      onKeyDown={onKeyDown}
      className="-mx-4 flex border-b bg-card px-2"
    >
      {sections.map((section) => (
        <button
          key={section}
          id={sectionTabId(section)}
          type="button"
          role="tab"
          aria-selected={section === current}
          aria-controls={SECTION_PANEL_ID}
          tabIndex={section === current ? 0 : -1}
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
