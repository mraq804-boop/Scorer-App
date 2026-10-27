"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type NameFieldProps = {
  name: string;
  label: string;
  value: string;
  error?: string;
  list?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
};

export function NameField({ name, label, value, error, list, readOnly, onChange }: NameFieldProps) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        dir="auto"
        value={value}
        list={list}
        readOnly={readOnly}
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="next"
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        onChange={(event) => onChange?.(event.target.value)}
        className={cn("h-12 rounded-xl px-3.5 md:text-base", readOnly === true && "bg-muted")}
      />
      {error !== undefined && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function NameSuggestions({ id, names }: { id: string; names: readonly string[] }) {
  return (
    <datalist id={id}>
      {names.map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  );
}

export function TeamCaption({ prefix, team }: { prefix: string; team: string }) {
  return (
    <p className="flex min-w-0 gap-1.5 text-sm text-muted-foreground">
      <span className="shrink-0">{prefix}</span>
      <bdi className="min-w-0 truncate font-medium text-foreground">{team}</bdi>
    </p>
  );
}
