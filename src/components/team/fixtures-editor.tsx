"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, Pencil, Play } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { CachedFixture, CachedTeam } from "@/lib/local/db";
import { upsertFixture } from "@/lib/team/remote";
import type { FixtureInput } from "@/lib/team/remote";
import { validateFixture, zonedParts } from "@/lib/validation/team";
import type { FixtureField, FixtureForm as FixtureValues } from "@/lib/validation/team";
import { FormAlert, SelectField, TextField, teamErrorMessage } from "./form";
import { FloatingAddButton, FormSheet } from "./form-sheet";

type FixturesEditorProps = { client: SupabaseClient; team: CachedTeam; onChanged: () => Promise<void> };

type FixtureFormProps = {
  initial: FixtureValues;
  existing: boolean;
  timeZone: string;
  submitLabel: string;
  onSubmit: (fixture: FixtureInput) => Promise<string | undefined>;
  onCancel?: () => void;
};

const STATUSES: CachedFixture["status"][] = ["scheduled", "played", "cancelled"];

const blankFixture = (): FixtureValues => ({
  id: crypto.randomUUID(),
  day: "",
  time: "",
  opponent: "",
  ground: "",
  homeAway: "",
  overs: "",
  notes: "",
  status: "scheduled",
});

function formValues(fixture: CachedFixture, timeZone: string): FixtureValues {
  const { day, time } = zonedParts(fixture.startsAt, timeZone);
  return {
    id: fixture.id,
    day,
    time,
    opponent: fixture.opponent,
    ground: fixture.ground ?? "",
    homeAway: fixture.homeAway ?? "",
    overs: fixture.overs === null ? "" : String(fixture.overs),
    notes: fixture.notes ?? "",
    status: fixture.status,
  };
}

function FixtureForm({ initial, existing, timeZone, submitLabel, onSubmit, onCancel }: FixtureFormProps) {
  const notesId = useId();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<FixtureField | "form", string>>>({});
  const [busy, setBusy] = useState(false);

  const update = (patch: Partial<FixtureValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const checked = validateFixture(values, timeZone);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setBusy(true);
    try {
      const failure = await onSubmit(checked.value);
      if (failure !== undefined) setErrors({ form: failure });
      else if (!existing) setValues(blankFixture());
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
      <div className="grid grid-cols-2 gap-2">
        <TextField
          type="date"
          label={t("team.fixtures.day")}
          value={values.day}
          error={errors.day}
          onChange={(day) => update({ day })}
        />
        <TextField
          type="time"
          label={t("team.fixtures.time")}
          value={values.time}
          error={errors.time}
          onChange={(time) => update({ time })}
        />
      </div>
      <TextField
        label={t("team.fixtures.opponent")}
        value={values.opponent}
        error={errors.opponent}
        onChange={(opponent) => update({ opponent })}
      />
      <TextField
        label={t("team.fixtures.ground")}
        value={values.ground}
        error={errors.ground}
        onChange={(ground) => update({ ground })}
      />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={t("team.fixtures.homeAway")}
          value={values.homeAway}
          onChange={(homeAway) => update({ homeAway: homeAway as FixtureValues["homeAway"] })}
        >
          <option value="">{t("team.fixtures.homeAway.none")}</option>
          <option value="home">{t("team.fixtures.home")}</option>
          <option value="away">{t("team.fixtures.away")}</option>
        </SelectField>
        <TextField
          type="number"
          label={t("team.fixtures.overs")}
          value={values.overs}
          error={errors.overs}
          onChange={(overs) => update({ overs })}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={notesId} className="text-sm leading-none font-medium">
          {t("team.fixtures.notes")}
        </label>
        <textarea
          id={notesId}
          dir="auto"
          rows={2}
          value={values.notes}
          aria-invalid={errors.notes === undefined ? undefined : true}
          aria-describedby={errors.notes === undefined ? undefined : `${notesId}-error`}
          onChange={(event) => update({ notes: event.target.value })}
          className="w-full min-w-0 rounded-xl border border-input bg-transparent px-3.5 py-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
        />
        {errors.notes !== undefined && (
          <p id={`${notesId}-error`} className="text-sm text-destructive">
            {errors.notes}
          </p>
        )}
      </div>
      {existing && (
        <SelectField
          label={t("team.fixtures.status")}
          value={values.status}
          onChange={(status) => update({ status: status as FixtureValues["status"] })}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`team.fixtures.status.${status}`)}
            </option>
          ))}
        </SelectField>
      )}
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

type FixtureRowProps = { fixture: CachedFixture; when: string; onEdit?: () => void };

function FixtureRow({ fixture, when, onEdit }: FixtureRowProps) {
  const details = [
    fixture.ground,
    fixture.homeAway === null ? null : t(fixture.homeAway === "home" ? "team.fixtures.home" : "team.fixtures.away"),
    fixture.overs === null ? null : t("team.fixtures.oversValue", { n: fixture.overs }),
  ].filter((detail) => detail !== null);
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card px-3.5 py-3">
      <div className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="num text-sm text-muted-foreground">{when}</span>
          <span className="truncate font-semibold">
            <bdi>{t("team.fixtures.vs", { opponent: fixture.opponent })}</bdi>
          </span>
          {details.length > 0 && (
            <span className="flex min-w-0 flex-wrap gap-x-2 text-sm text-muted-foreground">
              {details.map((detail) => (
                <bdi key={detail} className="truncate">
                  {detail}
                </bdi>
              ))}
            </span>
          )}
          {fixture.status !== "scheduled" && (
            <span className="text-sm font-semibold text-muted-foreground">{t(`team.fixtures.status.${fixture.status}`)}</span>
          )}
        </span>
        {onEdit !== undefined && (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={t("team.fixtures.edit", { opponent: fixture.opponent })}
            onClick={onEdit}
          >
            <Pencil className="size-5" aria-hidden />
          </Button>
        )}
      </div>
      {fixture.status === "scheduled" && (
        <Button asChild variant="outline" className="h-12 rounded-xl text-base">
          <a href={`/new?fixture=${fixture.id}`}>
            <Play className="size-5" aria-hidden />
            {t("team.fixtures.start")}
          </a>
        </Button>
      )}
    </div>
  );
}

export function FixturesEditor({ client, team, onChanged }: FixturesEditorProps) {
  const headingId = useId();
  const [sheet, setSheet] = useState<{ kind: "add" } | { kind: "edit"; id: string } | null>(null);
  const canEdit = team.role === "owner";
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone: team.timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
    [team.timeZone],
  );

  async function save(fixture: FixtureInput): Promise<string | undefined> {
    const result = await upsertFixture(client, fixture);
    if (!result.ok) return teamErrorMessage(result.error, t("team.error.fixturesFull"));
    setSheet(null);
    await onChanged();
    return undefined;
  }

  const editingFixture = sheet?.kind === "edit" ? team.fixtures.find((fixture) => fixture.id === sheet.id) : undefined;

  return (
    <section aria-labelledby={headingId} className={canEdit ? "flex flex-col gap-3 pb-16" : "flex flex-col gap-3"}>
      <div className="flex flex-col gap-0.5">
        <h2 id={headingId} className="text-lg font-bold">
          {t("team.fixtures.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("team.fixtures.timeZone", { zone: team.timeZone })}</p>
      </div>
      {team.fixtures.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("team.fixtures.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {team.fixtures.map((fixture) => (
            <li key={fixture.id}>
              <FixtureRow
                fixture={fixture}
                when={format.format(new Date(fixture.startsAt))}
                onEdit={canEdit ? () => setSheet({ kind: "edit", id: fixture.id }) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      {canEdit && <FloatingAddButton label={t("team.fixtures.addButton")} onClick={() => setSheet({ kind: "add" })} />}
      <FormSheet
        title={t(sheet?.kind === "edit" ? "team.fixtures.editTitle" : "team.fixtures.addButton")}
        open={sheet !== null}
        onClose={() => setSheet(null)}
      >
        {sheet?.kind === "add" && (
          <FixtureForm
            key="add"
            initial={blankFixture()}
            existing={false}
            timeZone={team.timeZone}
            submitLabel={t("team.fixtures.add")}
            onSubmit={save}
            onCancel={() => setSheet(null)}
          />
        )}
        {editingFixture !== undefined && (
          <FixtureForm
            key={editingFixture.id}
            initial={formValues(editingFixture, team.timeZone)}
            existing
            timeZone={team.timeZone}
            submitLabel={t("common.save")}
            onSubmit={save}
            onCancel={() => setSheet(null)}
          />
        )}
      </FormSheet>
    </section>
  );
}
