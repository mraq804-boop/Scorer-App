"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { CachedTeam } from "@/lib/local/db";
import { createTeam, updateTeam } from "@/lib/team/remote";
import type { NewTeam, TeamResult } from "@/lib/team/remote";
import { DEFAULT_TIME_ZONE, validateTeam } from "@/lib/validation/team";
import type { TeamField } from "@/lib/validation/team";
import { FormAlert, SelectField, TextField, teamErrorMessage } from "./form";

type TeamDetailsFormProps = {
  initial: { name: string; homeGround: string; timeZone: string };
  title: string;
  body: string;
  submitLabel: string;
  save: (team: NewTeam) => Promise<TeamResult<unknown>>;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
};

function timeZones(current: string): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes(current) ? zones : [current, ...zones];
}

function TeamDetailsForm({ initial, title, body, submitLabel, save, onSaved, onCancel }: TeamDetailsFormProps) {
  const [zones] = useState(() => timeZones(initial.timeZone));
  const [name, setName] = useState(initial.name);
  const [homeGround, setHomeGround] = useState(initial.homeGround);
  const [timeZone, setTimeZone] = useState(initial.timeZone);
  const [errors, setErrors] = useState<Partial<Record<TeamField | "form", string>>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const checked = validateTeam({ name, homeGround, timeZone });
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await save(checked.value);
      if (result.ok || result.error === "team_exists") {
        await onSaved();
        return;
      }
      setErrors(
        result.error === "invalid_time_zone" ? { timeZone: t("team.error.timeZone") } : { form: teamErrorMessage(result.error) },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <TextField label={t("team.create.name")} value={name} error={errors.name} onChange={setName} />
      <TextField label={t("team.create.ground")} value={homeGround} error={errors.homeGround} onChange={setHomeGround} />
      <SelectField label={t("team.create.timeZone")} value={timeZone} error={errors.timeZone} onChange={setTimeZone}>
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </SelectField>
      {errors.form !== undefined && <FormAlert message={errors.form} />}
      <div className="flex gap-2">
        {onCancel !== undefined && (
          <Button type="button" variant="outline" onClick={onCancel} className="h-14 flex-1 rounded-2xl text-base">
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={busy} className="h-14 flex-1 rounded-2xl text-base font-semibold">
          {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function CreateTeam({ client, onCreated }: { client: SupabaseClient; onCreated: () => Promise<void> }) {
  return (
    <TeamDetailsForm
      initial={{ name: "", homeGround: "", timeZone: DEFAULT_TIME_ZONE }}
      title={t("team.create.title")}
      body={t("team.create.body")}
      submitLabel={t("team.create.submit")}
      save={(team) => createTeam(client, team)}
      onSaved={onCreated}
    />
  );
}

type EditTeamProps = { client: SupabaseClient; team: CachedTeam; onSaved: () => Promise<void>; onCancel: () => void };

export function EditTeam({ client, team, onSaved, onCancel }: EditTeamProps) {
  return (
    <TeamDetailsForm
      initial={{ name: team.name, homeGround: team.homeGround ?? "", timeZone: team.timeZone }}
      title={t("team.edit.title")}
      body={t("team.edit.body")}
      submitLabel={t("common.save")}
      save={(details) => updateTeam(client, details)}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}
