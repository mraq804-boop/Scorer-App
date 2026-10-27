"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, Pencil } from "lucide-react";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/i18n";
import type { CachedTeam } from "@/lib/local/db";
import type { SquadPlayer, SquadRole } from "@/lib/team";
import { SQUAD_MAX_PLAYERS } from "@/lib/team/local";
import { upsertSquadPlayers } from "@/lib/team/remote";
import { validatePlayer } from "@/lib/validation/team";
import { FormAlert, ROLES, ROLE_LABELS, SelectField, TextField, teamErrorMessage } from "./form";

type SquadEditorProps = {
  client: SupabaseClient;
  team: CachedTeam;
  onChanged: () => Promise<void>;
};

type PlayerFormProps = {
  initial: SquadPlayer;
  submitLabel: string;
  existing: boolean;
  onSubmit: (player: SquadPlayer) => Promise<string | undefined>;
  onCancel?: () => void;
};

const blankPlayer = (): SquadPlayer => ({
  id: crypto.randomUUID(),
  name: "",
  role: null,
  active: true,
});

function PlayerForm({ initial, submitLabel, existing, onSubmit, onCancel }: PlayerFormProps) {
  const activeId = useId();
  const [player, setPlayer] = useState(initial);
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const update = (patch: Partial<SquadPlayer>) => {
    setPlayer((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const checked = validatePlayer(player);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setBusy(true);
    try {
      const failure = await onSubmit(checked.value);
      if (failure !== undefined) setErrors({ form: failure });
      else if (onCancel === undefined) setPlayer(blankPlayer());
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
      <TextField
        label={t(existing ? "team.squad.name" : "squad.add.name")}
        value={player.name}
        error={errors.name}
        onChange={(name) => update({ name })}
      />
      <SelectField
        label={t("squad.add.role")}
        value={player.role ?? ""}
        onChange={(role) => update({ role: role === "" ? null : (role as SquadRole) })}
      >
        <option value="">{t("squad.role.none")}</option>
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </SelectField>
      {existing && (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={activeId}>{t("team.squad.activeLabel")}</Label>
          <Switch id={activeId} checked={player.active} onCheckedChange={(active) => update({ active })} />
        </div>
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

function PlayerRow({ player, onEdit }: { player: SquadPlayer; onEdit?: () => void }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3.5 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <bdi className="truncate font-medium">{player.name}</bdi>
        <span className="flex gap-2 text-sm text-muted-foreground">
          {player.role !== null && <span>{ROLE_LABELS[player.role]}</span>}
          {!player.active && <span className="font-semibold">{t("team.squad.inactive")}</span>}
        </span>
      </span>
      {onEdit !== undefined && (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={t("team.squad.edit", { name: player.name })}
          onClick={onEdit}
        >
          <Pencil className="size-5" aria-hidden />
        </Button>
      )}
    </div>
  );
}

export function SquadEditor({ client, team, onChanged }: SquadEditorProps) {
  const headingId = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const canEdit = team.role === "owner";

  async function save(player: SquadPlayer): Promise<string | undefined> {
    const result = await upsertSquadPlayers(client, team.id, [player]);
    if (!result.ok) return teamErrorMessage(result.error, t("squad.error.full"));
    setEditing(null);
    await onChanged();
    return undefined;
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-lg font-bold">
          {t("team.squad.title")}
        </h2>
        <span className="num text-sm text-muted-foreground">{t("team.squad.count", { n: team.squad.length })}</span>
      </div>
      {team.squad.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("team.squad.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {team.squad.map((player) => (
            <li key={player.id}>
              {editing === player.id ? (
                <PlayerForm
                  initial={player}
                  submitLabel={t("common.save")}
                  existing
                  onSubmit={save}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <PlayerRow player={player} onEdit={canEdit ? () => setEditing(player.id) : undefined} />
              )}
            </li>
          ))}
        </ul>
      )}
      {team.squad.length < SQUAD_MAX_PLAYERS ? (
        <PlayerForm initial={blankPlayer()} submitLabel={t("team.squad.add")} existing={false} onSubmit={save} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("squad.error.full")}</p>
      )}
    </section>
  );
}
