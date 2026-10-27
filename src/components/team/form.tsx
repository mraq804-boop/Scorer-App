"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import type { SquadRole } from "@/lib/team";
import type { TeamError } from "@/lib/team/remote";

export const ROLE_LABELS: Record<SquadRole, string> = {
  batter: t("squad.role.batter"),
  bowler: t("squad.role.bowler"),
  allrounder: t("squad.role.allrounder"),
  keeper: t("squad.role.keeper"),
};

export const ROLES = Object.keys(ROLE_LABELS) as SquadRole[];

export const SELECT_CLASS =
  "h-12 w-full min-w-0 rounded-xl border border-input bg-transparent px-3 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 [&>option]:bg-background [&>option]:text-foreground";

export function teamErrorMessage(error: TeamError, quota: string = t("team.error.saveFailed")): string {
  switch (error) {
    case "network":
      return t("team.error.network");
    case "not_signed_in":
      return t("team.error.signedOut");
    case "not_team_owner":
      return t("team.error.notAllowed");
    case "quota_exceeded":
      return quota;
    default:
      return t("team.error.saveFailed");
  }
}

type FieldProps = {
  label: string;
  error?: string;
  children: (props: FieldControlProps) => ReactNode;
};
type FieldControlProps = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

function Field({ label, error, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-invalid": error === undefined ? undefined : true,
        "aria-describedby": error === undefined ? undefined : errorId,
      })}
      {error !== undefined && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  error?: string;
  type?: "text" | "date";
  onChange: (value: string) => void;
};

export function TextField({ label, value, error, type = "text", onChange }: TextFieldProps) {
  return (
    <Field label={label} error={error}>
      {(control) => (
        <Input
          {...control}
          type={type}
          dir="auto"
          value={value}
          autoComplete="off"
          autoCapitalize={type === "text" ? "words" : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 rounded-xl px-3.5 md:text-base"
        />
      )}
    </Field>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  children: ReactNode;
};

export function SelectField({ label, value, error, onChange, children }: SelectFieldProps) {
  return (
    <Field label={label} error={error}>
      {(control) => (
        <select {...control} dir="auto" value={value} onChange={(event) => onChange(event.target.value)} className={SELECT_CLASS}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function FormAlert({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-destructive">
      {message}
    </p>
  );
}
