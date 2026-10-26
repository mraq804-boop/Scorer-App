"use client";

import { useId } from "react";
import { SegmentedControl } from "@/components/segmented-control";
import { Stepper } from "@/components/stepper";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/i18n";
import type { Rules } from "@/lib/scoring";
import { EXTRA_RUNS_MAX, PLAYERS_MAX, PLAYERS_MIN } from "@/lib/validation/match-setup";

export type TunableRules = Omit<Rules, "ballType" | "oversPerInnings">;

type RulesFieldsProps = {
  rules: TunableRules;
  onChange: <K extends keyof TunableRules>(key: K, value: TunableRules[K]) => void;
};

const BALLS_PER_OVER = [
  { value: 6, label: "6" },
  { value: 8, label: "8" },
] as const;

export function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <Label htmlFor={id} className="min-w-0 flex-1 text-sm leading-snug">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function RulesFields({ rules, onChange }: RulesFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label={t("setup.ballsPerOver")}
        value={rules.ballsPerOver}
        options={BALLS_PER_OVER}
        onChange={(value) => onChange("ballsPerOver", value)}
      />
      <Stepper
        label={t("setup.playersA")}
        value={rules.playersPerSide.A}
        min={PLAYERS_MIN}
        max={PLAYERS_MAX}
        onChange={(value) => onChange("playersPerSide", { ...rules.playersPerSide, A: value })}
      />
      <Stepper
        label={t("setup.playersB")}
        value={rules.playersPerSide.B}
        min={PLAYERS_MIN}
        max={PLAYERS_MAX}
        onChange={(value) => onChange("playersPerSide", { ...rules.playersPerSide, B: value })}
      />
      <Stepper
        label={t("setup.wideRuns")}
        value={rules.wideRuns}
        min={0}
        max={EXTRA_RUNS_MAX}
        onChange={(value) => onChange("wideRuns", value)}
      />
      <ToggleRow label={t("setup.wideRebowled")} checked={rules.wideRebowled} onChange={(value) => onChange("wideRebowled", value)} />
      <Stepper
        label={t("setup.noBallRuns")}
        value={rules.noBallRuns}
        min={0}
        max={EXTRA_RUNS_MAX}
        onChange={(value) => onChange("noBallRuns", value)}
      />
      <ToggleRow label={t("setup.freeHit")} checked={rules.freeHit} onChange={(value) => onChange("freeHit", value)} />
      <ToggleRow label={t("setup.lbw")} checked={rules.lbw} onChange={(value) => onChange("lbw", value)} />
      <ToggleRow
        label={t("setup.lastManStands")}
        checked={rules.lastManStands}
        onChange={(value) => onChange("lastManStands", value)}
      />
    </div>
  );
}
