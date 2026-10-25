"use client";

import { t } from "@/lib/i18n";
import type { BallKind, RunsAs } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export type ExtrasSelection = { kind: BallKind; runsAs: RunsAs };
export type ExtraToggle = "wide" | "noball" | "bye" | "legbye";

export const NO_EXTRAS: ExtrasSelection = { kind: "legal", runsAs: "bat" };

const TOGGLES: readonly { toggle: ExtraToggle; label: string }[] = [
  { toggle: "wide", label: t("score.extra.wide") },
  { toggle: "noball", label: t("score.extra.noBall") },
  { toggle: "bye", label: t("score.extra.bye") },
  { toggle: "legbye", label: t("score.extra.legBye") },
];

function isKind(toggle: ExtraToggle): toggle is "wide" | "noball" {
  return toggle === "wide" || toggle === "noball";
}

export function toggleExtra(current: ExtrasSelection, toggle: ExtraToggle): ExtrasSelection {
  if (isKind(toggle)) {
    if (current.kind === toggle) return { ...current, kind: "legal" };
    return { kind: toggle, runsAs: toggle === "wide" ? "bat" : current.runsAs };
  }
  if (current.runsAs === toggle) return { ...current, runsAs: "bat" };
  return { kind: current.kind === "wide" ? "legal" : current.kind, runsAs: toggle };
}

export function isPressed(selection: ExtrasSelection, toggle: ExtraToggle): boolean {
  return isKind(toggle) ? selection.kind === toggle : selection.runsAs === toggle;
}

type ExtrasTogglesProps = {
  value: ExtrasSelection;
  disabled: boolean;
  dimmed: boolean;
  onChange: (value: ExtrasSelection) => void;
};

export function ExtrasToggles({ value, disabled, dimmed, onChange }: ExtrasTogglesProps) {
  return (
    <div role="group" aria-label={t("score.extras")} className={cn("grid grid-cols-4 gap-2", dimmed && "opacity-40")}>
      {TOGGLES.map(({ toggle, label }) => {
        const pressed = isPressed(value, toggle);
        return (
          <button
            key={toggle}
            type="button"
            data-testid={`toggle-${toggle}`}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onChange(toggleExtra(value, toggle))}
            className={cn(
              "h-12 min-w-0 rounded-xl border-2 px-1 text-sm font-bold transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/60",
              pressed ? "border-haldi bg-haldi text-black" : "border-border bg-card text-foreground",
            )}
          >
            <span className="block truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
