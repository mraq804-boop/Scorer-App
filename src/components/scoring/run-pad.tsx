"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Tap = { testId: string; label: string; runs: number; boundary: boolean; wordy?: boolean };

const MAIN: readonly Tap[] = [0, 1, 2, 3, 4, 6].map((runs) => ({
  testId: `run-${runs}`,
  label: String(runs),
  runs,
  boundary: runs === 4 || runs === 6,
}));

const MORE: readonly Tap[] = [
  { testId: "run-5", label: "5", runs: 5, boundary: false },
  { testId: "run-7", label: "7", runs: 7, boundary: false },
  { testId: "run-4-ran", label: t("score.fourRun"), runs: 4, boundary: false, wordy: true },
];

type RunPadProps = {
  disabled: boolean;
  dimmed: boolean;
  onRuns: (runs: number, boundary: boolean) => void;
};

export function RunPad({ disabled, dimmed, onRuns }: RunPadProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();

  const tap = ({ runs, boundary }: Tap) => {
    setMoreOpen(false);
    onRuns(runs, boundary);
  };

  return (
    <div className={cn("flex flex-col gap-2", dimmed && "opacity-40")}>
      <div role="group" aria-label={t("score.runs")} className="grid grid-cols-3 gap-2">
        {MAIN.map((entry) => (
          <button
            key={entry.testId}
            type="button"
            data-testid={entry.testId}
            disabled={disabled}
            onClick={() => tap(entry)}
            className={cn(
              "num h-[4.5rem] rounded-2xl border-2 text-4xl font-extrabold transition-transform outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95",
              entry.boundary ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-expanded={moreOpen}
        aria-controls={moreId}
        disabled={disabled}
        onClick={() => setMoreOpen((open) => !open)}
        className="flex h-10 items-center justify-center gap-1 rounded-xl text-sm font-semibold text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        {t("score.more")}
        <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} aria-hidden />
      </button>
      {moreOpen && (
        <div id={moreId} className="grid grid-cols-[1fr_1fr_2fr] gap-2">
          {MORE.map((entry) => (
            <button
              key={entry.testId}
              type="button"
              data-testid={entry.testId}
              disabled={disabled}
              onClick={() => tap(entry)}
              className={cn(
                "num h-14 min-w-0 rounded-2xl border-2 border-border bg-card px-2 font-bold text-foreground outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95",
                entry.wordy ? "text-sm leading-tight" : "text-2xl",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
