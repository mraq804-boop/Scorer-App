"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, Mail, Pencil } from "lucide-react";
import { useEffect, useId, useState } from "react";
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
import {
  deleteTeamPicture,
  fetchScorerEmails,
  replaceTeamPicture,
  setPlayerPhoto,
  setPlayerScorerEmail,
  upsertSquadPlayers,
} from "@/lib/team/remote";
import type { ScorerEmail, TeamResult } from "@/lib/team/remote";
import { scorerInviteHref } from "@/lib/team/scorer-mail";
import { siteUrl } from "@/lib/site-url";
import { validatePlayer, validateScorerEmail } from "@/lib/validation/team";
import { FormAlert, ROLES, ROLE_LABELS, SelectField, TextField, teamErrorMessage } from "./form";
import { FloatingAddButton, FormSheet } from "./form-sheet";
import { PictureInput } from "./picture-input";

type SquadEditorProps = {
  client: SupabaseClient;
  team: CachedTeam;
  onChanged: () => Promise<void>;
};

type Sheet = { kind: "add" } | { kind: "edit"; id: string } | null;

type Emails = ReadonlyMap<string, ScorerEmail> | "failed" | null;

type Scoring = { email: string | null; canScore: boolean };

type Access = { emails: Emails; teamName: string; retry: () => void };

type PlayerFormProps = {
  initial: SquadPlayer;
  submitLabel: string;
  existing: boolean;
  access?: Access;
  onSubmit: (player: SquadPlayer, scoring?: Scoring) => Promise<string | undefined>;
  onCancel?: () => void;
  onRemovePhoto?: () => Promise<void>;
};

const blankPlayer = (): SquadPlayer => ({
  id: crypto.randomUUID(),
  name: "",
  role: null,
  active: true,
});

function emailMap(result: TeamResult<ScorerEmail[]>): Emails {
  return result.ok ? new Map(result.value.map((row) => [row.playerId, row])) : "failed";
}

function emailsFor(emails: Emails, playerId: string): ScorerEmail | undefined {
  return emails instanceof Map ? emails.get(playerId) : undefined;
}

function ScoringStatus({ current, player, teamName }: { current: ScorerEmail; player: string; teamName: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{t(current.joined ? "team.squad.scoring.joined" : "team.squad.scoring.waiting")}</p>
      <a
        href={scorerInviteHref({ email: current.email, player, team: teamName, site: siteUrl() })}
        className="press inline-flex h-11 items-center gap-2 self-start rounded-xl border-2 px-4 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Mail className="size-4" aria-hidden />
        {t("team.squad.sendEmail")}
      </a>
    </div>
  );
}

function PlayerForm({ initial, submitLabel, existing, access, onSubmit, onCancel, onRemovePhoto }: PlayerFormProps) {
  const activeId = useId();
  const canScoreId = useId();
  const hintId = useId();
  const current = access === undefined ? undefined : emailsFor(access.emails, initial.id);
  const scoringReady = access !== undefined && access.emails instanceof Map;
  const saved = { email: current?.email ?? "", canScore: current?.canScore ?? false };
  const [player, setPlayer] = useState(initial);
  const [scoring, setScoring] = useState<{ email: string; canScore: boolean } | null>(() => (scoringReady ? saved : null));
  if (scoringReady && scoring === null) setScoring(saved);
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const email = scoring?.email ?? "";
  const canScore = scoring?.canScore ?? false;
  const hasEmail = email.trim() !== "";

  const update = (patch: Partial<SquadPlayer>) => {
    setPlayer((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const checked = validatePlayer(player);
    const mail = scoringReady ? validateScorerEmail(email) : undefined;
    if (!checked.ok || (mail !== undefined && !mail.ok)) {
      setErrors({ ...(checked.ok ? {} : checked.errors), ...(mail !== undefined && !mail.ok ? mail.errors : {}) });
      return;
    }
    const scoring = mail === undefined ? undefined : { email: mail.value, canScore: mail.value !== null && canScore };
    setBusy(true);
    try {
      const failure = await onSubmit(checked.value, scoring);
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
      {access !== undefined && access.emails === "failed" && (
        <div role="status" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{t("team.squad.emailsFailed")}</span>
          <Button type="button" variant="outline" onClick={access.retry} className="h-10 rounded-xl">
            {t("team.squad.emailsRetry")}
          </Button>
        </div>
      )}
      {scoringReady && (
        <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3">
          <TextField
            label={t("team.squad.email")}
            type="email"
            value={email}
            error={errors.email}
            onChange={(value) => {
              setScoring({ email: value, canScore });
              setErrors({});
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={canScoreId}>{t("team.squad.canScore")}</Label>
            <Switch
              id={canScoreId}
              checked={hasEmail && canScore}
              disabled={!hasEmail}
              aria-describedby={hintId}
              onCheckedChange={(next) => setScoring({ email, canScore: next })}
            />
          </div>
          <p id={hintId} className="text-sm text-muted-foreground">
            {t("team.squad.emailHint", { team: access.teamName })}
          </p>
          {current?.canScore === true && <ScoringStatus current={current} player={initial.name} teamName={access.teamName} />}
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

type PlayerRowProps = { player: SquadPlayer; leading: ReactNode; scoring?: ScorerEmail; onEdit?: () => void };

function PlayerRow({ player, leading, scoring, onEdit }: PlayerRowProps) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3.5 py-2">
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <bdi className="truncate font-medium">{player.name}</bdi>
        <span className="flex gap-2 text-sm text-muted-foreground">
          {player.role !== null && <span>{ROLE_LABELS[player.role]}</span>}
          {!player.active && <span className="font-semibold">{t("team.squad.inactive")}</span>}
          {scoring?.canScore === true && (
            <span className="font-semibold text-foreground">{t(scoring.joined ? "team.squad.tag.scorer" : "team.squad.tag.invited")}</span>
          )}
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
  const [sheet, setSheet] = useState<Sheet>(null);
  const [open, setOpen] = useState(false);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const [emails, setEmails] = useState<Emails>(null);
  const show = (next: NonNullable<Sheet>) => {
    setPhotoError(undefined);
    setSheet(next);
    setOpen(true);
  };
  const hide = () => setOpen(false);
  const canEdit = team.role === "owner";
  const colour = colourFor(team.colour, team.name);

  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    void fetchScorerEmails(client).then((result) => {
      if (active) setEmails(emailMap(result));
    });
    return () => {
      active = false;
    };
  }, [client, canEdit]);

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
    hide();
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
        title={t("brand.adjust.photo")}
        size={PHOTO_SIZE}
        fill={colour.base}
        onPicked={(blob) => savePhoto(player, blob)}
        onError={setPhotoError}
        className="rounded-full"
      >
        {avatar}
      </PictureInput>
    );
  };

  async function save(player: SquadPlayer, scoring?: Scoring): Promise<string | undefined> {
    const result = await upsertSquadPlayers(client, team.id, [player]);
    if (!result.ok) return teamErrorMessage(result.error, t("squad.error.full"));
    const current = emailsFor(emails, player.id);
    if (scoring !== undefined && ((current?.email ?? null) !== scoring.email || (current?.canScore ?? false) !== scoring.canScore)) {
      const access = await setPlayerScorerEmail(client, player.id, scoring.email, scoring.canScore);
      if (!access.ok) {
        await onChanged();
        return teamErrorMessage(access.error);
      }
      setEmails(emailMap(await fetchScorerEmails(client)));
    }
    hide();
    await onChanged();
    return undefined;
  }

  const editingPlayer = sheet?.kind === "edit" ? team.squad.find((player) => player.id === sheet.id) : undefined;
  const retryEmails = () => {
    setEmails(null);
    void fetchScorerEmails(client).then((result) => setEmails(emailMap(result)));
  };
  const access: Access | undefined = canEdit ? { emails, teamName: team.name, retry: retryEmails } : undefined;
  const canAdd = team.squad.length < SQUAD_MAX_PLAYERS;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 pb-16">
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
              <PlayerRow
                player={player}
                leading={leadingFor(player)}
                scoring={emailsFor(emails, player.id)}
                onEdit={canEdit ? () => show({ kind: "edit", id: player.id }) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      {canAdd ? (
        <FloatingAddButton label={t("team.squad.addButton")} onClick={() => show({ kind: "add" })} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("squad.error.full")}</p>
      )}
      <FormSheet
        title={t(sheet?.kind === "edit" ? "team.squad.editTitle" : "team.squad.addButton")}
        open={open}
        onClose={hide}
      >
        {photoError !== undefined && sheet?.kind === "edit" && (
          <div className="pb-3">
            <FormAlert message={photoError} />
          </div>
        )}
        {sheet?.kind === "add" && (
          <PlayerForm
            key="add"
            initial={blankPlayer()}
            submitLabel={t("team.squad.add")}
            existing={false}
            access={access}
            onSubmit={save}
            onCancel={hide}
          />
        )}
        {editingPlayer !== undefined && (
          <PlayerForm
            key={editingPlayer.id}
            initial={editingPlayer}
            submitLabel={t("common.save")}
            existing
            access={access}
            onSubmit={save}
            onCancel={hide}
            onRemovePhoto={editingPlayer.photoVersion === undefined ? undefined : () => removePhoto(editingPlayer)}
          />
        )}
      </FormSheet>
    </section>
  );
}
