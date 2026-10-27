"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { createTeam } from "@/lib/team/remote";
import { DEFAULT_TIME_ZONE, validateTeam } from "@/lib/validation/team";
import type { TeamField } from "@/lib/validation/team";
import { FormAlert, SelectField, TextField, teamErrorMessage } from "./form";

type CreateTeamProps = {
  client: SupabaseClient;
  onCreated: () => Promise<void>;
};

function timeZones(): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes(DEFAULT_TIME_ZONE) ? zones : [DEFAULT_TIME_ZONE, ...zones];
}

export function CreateTeam({ client, onCreated }: CreateTeamProps) {
  const [zones] = useState(timeZones);
  const [name, setName] = useState("");
  const [homeGround, setHomeGround] = useState("");
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
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
      const result = await createTeam(client, checked.value);
      if (result.ok || result.error === "team_exists") {
        await onCreated();
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
        <h2 className="text-xl font-bold">{t("team.create.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("team.create.body")}</p>
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
      <Button type="submit" disabled={busy} className="h-14 w-full rounded-2xl text-base font-semibold">
        {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
        {t("team.create.submit")}
      </Button>
    </form>
  );
}
