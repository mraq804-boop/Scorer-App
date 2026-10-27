"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, Pencil } from "lucide-react";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { CachedTeam } from "@/lib/local/db";
import type { Season } from "@/lib/team";
import { upsertSeason } from "@/lib/team/remote";
import { validateSeason } from "@/lib/validation/team";
import type { SeasonField } from "@/lib/validation/team";
import { FormAlert, TextField, teamErrorMessage } from "./form";

type SeasonsEditorProps = {
  client: SupabaseClient;
  team: CachedTeam;
  onChanged: () => Promise<void>;
};

type SeasonFormProps = {
  initial: Season;
  submitLabel: string;
  onSubmit: (season: Season) => Promise<string | undefined>;
  onCancel?: () => void;
};

const dayFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

const blankSeason = (): Season => ({
  id: crypto.randomUUID(),
  name: "",
  startsOn: "",
  endsOn: "",
});

function SeasonForm({ initial, submitLabel, onSubmit, onCancel }: SeasonFormProps) {
  const [season, setSeason] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<SeasonField | "form", string>>>({});
  const [busy, setBusy] = useState(false);

  const update = (patch: Partial<Season>) => {
    setSeason((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const checked = validateSeason(season);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setBusy(true);
    try {
      const failure = await onSubmit(checked.value);
      if (failure !== undefined) setErrors({ form: failure });
      else if (onCancel === undefined) setSeason(blankSeason());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3 rounded-2xl border border-dashed p-3"
    >
      <TextField label={t("team.seasons.name")} value={season.name} error={errors.name} onChange={(name) => update({ name })} />
      <div className="grid grid-cols-2 gap-2">
        <TextField
          type="date"
          label={t("team.seasons.start")}
          value={season.startsOn}
          error={errors.startsOn}
          onChange={(startsOn) => update({ startsOn })}
        />
        <TextField
          type="date"
          label={t("team.seasons.end")}
          value={season.endsOn}
          error={errors.endsOn}
          onChange={(endsOn) => update({ endsOn })}
        />
      </div>
      {errors.form !== undefined && <FormAlert message={errors.form} />}
      <div className="flex gap-2">
        {onCancel !== undefined && (
          <Button type="button" variant="outline" onClick={onCancel} className="h-12 flex-1 rounded-xl text-base">
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={busy} className="h-12 flex-1 rounded-xl text-base font-semibold">
          {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function SeasonRow({ season, onEdit }: { season: Season; onEdit: () => void }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3.5 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <bdi className="truncate font-medium">{season.name}</bdi>
        <span className="num text-sm text-muted-foreground">
          {t("team.seasons.range", {
            start: formatDay(season.startsOn),
            end: formatDay(season.endsOn),
          })}
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label={t("team.seasons.edit", { name: season.name })}
        onClick={onEdit}
      >
        <Pencil className="size-5" aria-hidden />
      </Button>
    </div>
  );
}

export function SeasonsEditor({ client, team, onChanged }: SeasonsEditorProps) {
  const headingId = useId();
  const [editing, setEditing] = useState<string | null>(null);

  async function save(season: Season): Promise<string | undefined> {
    const result = await upsertSeason(client, season);
    if (!result.ok) return teamErrorMessage(result.error, t("team.error.seasonsFull"));
    setEditing(null);
    await onChanged();
    return undefined;
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-bold">
        {t("team.seasons.title")}
      </h2>
      {team.seasons.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("team.seasons.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {team.seasons.map((season) => (
            <li key={season.id}>
              {editing === season.id ? (
                <SeasonForm initial={season} submitLabel={t("common.save")} onSubmit={save} onCancel={() => setEditing(null)} />
              ) : (
                <SeasonRow season={season} onEdit={() => setEditing(season.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
      <SeasonForm initial={blankSeason()} submitLabel={t("team.seasons.add")} onSubmit={save} />
    </section>
  );
}
