"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, Pencil } from "lucide-react";
import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Avatar } from "@/components/team-page/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { colourFor, nextPictureVersion, photoPath, photoUrl } from "@/lib/brand";
import { t } from "@/lib/i18n";
import type { CachedTeam } from "@/lib/local/db";
import type { SquadPlayer, SquadRole } from "@/lib/team";
import { PHOTO_SIZE } from "@/lib/media/prepare-image";
import { SQUAD_MAX_PLAYERS } from "@/lib/team/local";
import { deleteTeamPicture, replaceTeamPicture, setPlayerPhoto, upsertSquadPlayers } from "@/lib/team/remote";
import { validatePlayer } from "@/lib/validation/team";
import { FormAlert, ROLES, ROLE_LABELS, SelectField, TextField, teamErrorMessage } from "./form";
import { PictureInput } from "./picture-input";

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
  onRemovePhoto?: () => Promise<void>;
};

const blankPlayer = (): SquadPlayer => ({
  id: crypto.randomUUID(),
  name: "",
  role: null,
  active: true,
});

function PlayerForm({ initial, submitLabel, existing, onSubmit, onCancel, onRemovePhoto }: PlayerFormProps) {
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
      {onRemovePhoto !== undefined && (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void onRemovePhoto()}
          className="h-10 self-start rounded-xl"
        >
          {t("brand.removePhoto")}
        </Button>
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

function PlayerRow({ player, leading, onEdit }: { player: SquadPlayer; leading: ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3.5 py-2">
      {leading}
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
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const canEdit = team.role === "owner";
  const colour = colourFor(team.colour, team.name);

  async function savePhoto(player: SquadPlayer, blob: Blob): Promise<void> {
    setPhotoError(undefined);
    const current = player.photoVersion ?? null;
    const version = nextPictureVersion(current);
    const result = await replaceTeamPicture(client, {
      newPath: photoPath(team.code, player.id, version),
      oldPath: current === null ? null : photoPath(team.code, player.id, current),
      blob,
      save: () => setPlayerPhoto(client, player.id, version),
    });
    if (result.ok) await onChanged();
    else setPhotoError(teamErrorMessage(result.error));
  }

  async function removePhoto(player: SquadPlayer): Promise<void> {
    setPhotoError(undefined);
    const result = await setPlayerPhoto(client, player.id, null);
    if (!result.ok) {
      setPhotoError(teamErrorMessage(result.error));
      return;
    }
    if (player.photoVersion !== undefined) await deleteTeamPicture(client, photoPath(team.code, player.id, player.photoVersion));
    setEditing(null);
    await onChanged();
  }

  const leadingFor = (player: SquadPlayer) => {
    const avatar = (
      <Avatar name={player.name} url={photoUrl(team.code, player.id, player.photoVersion)} size={44} colour={colour} />
    );
    if (!canEdit) return avatar;
    const label = t(player.photoVersion === undefined ? "brand.addPhoto" : "brand.changePhoto", { name: player.name });
    return (
      <PictureInput
        label={label}
        size={PHOTO_SIZE}
        onPicked={(blob) => savePhoto(player, blob)}
        onError={setPhotoError}
        className="rounded-full"
      >
        {avatar}
      </PictureInput>
    );
  };

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
      {photoError !== undefined && <FormAlert message={photoError} />}
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
                  onRemovePhoto={player.photoVersion === undefined ? undefined : () => removePhoto(player)}
                />
              ) : (
                <PlayerRow
                  player={player}
                  leading={leadingFor(player)}
                  onEdit={canEdit ? () => setEditing(player.id) : undefined}
                />
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
