"use client";

import { useId, useState } from "react";
import { initialSettings, settingsDraft } from "@/components/scoring/settings-draft";
import type { SettingsErrors, SettingsValues } from "@/components/scoring/settings-draft";
import { Stepper } from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import type { EventDraft, InningsState, MatchState } from "@/lib/scoring";
import { PLAYERS_MAX, PLAYERS_MIN } from "@/lib/validation/match-setup";

type NumberFieldProps = { label: string; value: string; error?: string; onChange: (value: string) => void };

function NumberField({ label, value, error, onChange }: NumberFieldProps) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        step={1}
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        onChange={(event) => onChange(event.target.value)}
        className="num h-12 rounded-xl px-3.5 md:text-base"
      />
      {error !== undefined && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

type SettingsSheetProps = {
  state: MatchState;
  innings: InningsState;
  busy: boolean;
  onClose: () => void;
  onRecord: (drafts: EventDraft[]) => Promise<boolean>;
};

export function SettingsSheet({ state, innings, busy, onClose, onRecord }: SettingsSheetProps) {
  const [values, setValues] = useState<SettingsValues>(() => initialSettings(state));
  const [errors, setErrors] = useState<SettingsErrors>({});
  const inChase = innings.number === 2;

  const update = (patch: Partial<SettingsValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  async function save() {
    const result = settingsDraft(state, values, inChase);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (result.draft === null || (await onRecord([result.draft]))) onClose();
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t("menu.settings")}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-2">
          <NumberField label={t("setup.overs")} value={values.overs} error={errors.overs} onChange={(overs) => update({ overs })} />
          <Stepper
            label={t("settings.players", { team: state.teams.A.name })}
            value={values.playersA}
            min={PLAYERS_MIN}
            max={PLAYERS_MAX}
            onChange={(playersA) => update({ playersA })}
          />
          <Stepper
            label={t("settings.players", { team: state.teams.B.name })}
            value={values.playersB}
            min={PLAYERS_MIN}
            max={PLAYERS_MAX}
            onChange={(playersB) => update({ playersB })}
          />
          {inChase && (
            <NumberField
              label={t("settings.target")}
              value={values.target}
              error={errors.target}
              onChange={(target) => update({ target })}
            />
          )}
        </div>
        <DrawerFooter>
          <Button disabled={busy} onClick={() => void save()} className="h-14 rounded-2xl text-base font-bold">
            {t("common.save")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
