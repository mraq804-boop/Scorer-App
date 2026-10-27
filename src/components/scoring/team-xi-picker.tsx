"use client";

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { getLocalDb } from "@/lib/local/db";
import type { SquadPlayer, SquadRole } from "@/lib/team";
import { SquadAddError, addSquadPlayerOffline } from "@/lib/team/local";
import type { SquadAddErrorCode } from "@/lib/team/local";

const ROLE_LABELS: Record<SquadRole, string> = {
  batter: t("squad.role.batter"),
  bowler: t("squad.role.bowler"),
  allrounder: t("squad.role.allrounder"),
  keeper: t("squad.role.keeper"),
};

const ROLES = Object.keys(ROLE_LABELS) as SquadRole[];

const ADD_ERRORS: Record<SquadAddErrorCode, string> = {
  no_team: t("squad.error.noTeam"),
  name_required: t("squad.error.nameRequired"),
  name_too_long: t("squad.error.nameTooLong"),
  squad_full: t("squad.error.full"),
};

const SELECT_CLASS =
  "h-12 w-full min-w-0 rounded-xl border border-input bg-transparent px-3 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 [&>option]:bg-background [&>option]:text-foreground";

export function squadLabels(squad: readonly SquadPlayer[]): Map<string, string> {
  const keyOf = (player: SquadPlayer) => player.name.toLocaleLowerCase();
  const sharing = new Map<string, number>();
  for (const player of squad) sharing.set(keyOf(player), (sharing.get(keyOf(player)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const player of squad) {
    if ((sharing.get(keyOf(player)) ?? 0) < 2) {
      labels.set(player.id, player.name);
      continue;
    }
    const position = (seen.get(keyOf(player)) ?? 0) + 1;
    seen.set(keyOf(player), position);
    labels.set(player.id, `${player.name} (${position})`);
  }
  return labels;
}

type XiSelectProps = {
  name: string;
  label: string;
  value: string;
  players: readonly SquadPlayer[];
  labels: ReadonlyMap<string, string>;
  error?: string;
  onChange: (id: string) => void;
};

export function XiSelect({ name, label, value, players, labels, error, onChange }: XiSelectProps) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        dir="auto"
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">{t("setup.pickPlayer")}</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {labels.get(player.id)}
          </option>
        ))}
      </select>
      {error !== undefined && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function AddToSquad({ onAdded }: { onAdded: (player: SquadPlayer) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<SquadRole | "">("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const errorId = useId();

  async function add() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const player = await addSquadPlayerOffline(getLocalDb(), { name, role: role === "" ? null : role });
      setName("");
      setRole("");
      onAdded(player);
    } catch (failure) {
      setError(failure instanceof SquadAddError ? ADD_ERRORS[failure.code] : t("squad.add.failed"));
    } finally {
      setBusy(false);
    }
  }

  function onEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void add();
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed p-3">
      <Input
        dir="auto"
        value={name}
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="done"
        aria-label={t("squad.add.name")}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        placeholder={t("squad.add.name")}
        onChange={(event) => {
          setName(event.target.value);
          setError(undefined);
        }}
        onKeyDown={onEnter}
        className="h-12 rounded-xl px-3.5 md:text-base"
      />
      <div className="flex gap-2">
        <select
          aria-label={t("squad.add.role")}
          value={role}
          onChange={(event) => setRole(event.target.value as SquadRole | "")}
          className={SELECT_CLASS}
        >
          <option value="">{t("squad.role.none")}</option>
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void add()} className="h-12 shrink-0 rounded-xl px-4">
          {t("squad.add")}
        </Button>
      </div>
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

type TeamXiPickerProps = {
  squad: readonly SquadPlayer[];
  labels: ReadonlyMap<string, string>;
  selected: readonly string[];
  error?: string;
  onToggle: (id: string) => void;
  onAdded: (player: SquadPlayer) => void;
};

export function TeamXiPicker({ squad, labels, selected, error, onToggle, onAdded }: TeamXiPickerProps) {
  const id = useId();
  return (
    <fieldset
      name="xi"
      tabIndex={-1}
      aria-describedby={error === undefined ? undefined : `${id}-error`}
      className="flex min-w-0 flex-col gap-3 outline-none"
    >
      <legend className="mb-2 text-sm font-medium">{t("setup.xi")}</legend>
      <p aria-live="polite" className="num -mt-1 text-sm text-muted-foreground">
        {t("setup.xi.selected", { n: selected.length })}
      </p>
      {squad.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("setup.xi.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {squad.map((player) => (
            <li key={player.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3.5 has-[:checked]:border-primary has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
                <input
                  type="checkbox"
                  checked={selected.includes(player.id)}
                  aria-describedby={player.role === null ? undefined : `${id}-${player.id}`}
                  onChange={() => onToggle(player.id)}
                  className="size-5 shrink-0 accent-primary"
                />
                <bdi className="min-w-0 flex-1 truncate font-medium">{labels.get(player.id)}</bdi>
                {player.role !== null && (
                  <span id={`${id}-${player.id}`} aria-hidden className="shrink-0 text-sm text-muted-foreground">
                    {ROLE_LABELS[player.role]}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
      {error !== undefined && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
      <AddToSquad onAdded={onAdded} />
    </fieldset>
  );
}
