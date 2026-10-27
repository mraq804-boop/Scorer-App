"use client";

import { useId, useState } from "react";
import { NameField, NameSuggestions } from "@/components/scoring/name-field";
import type { XiPlayer } from "@/components/scoring/player-drafts";
import { XiSelect, squadLabels } from "@/components/scoring/team-xi-picker";
import { t } from "@/lib/i18n";

const SOMEONE_ELSE = "someone-else";

export type FielderValue = { fielder: string; fielderId: string | null };

type FielderFieldProps = {
  squad: readonly XiPlayer[];
  suggestions: readonly string[];
  value: FielderValue;
  error?: string;
  onChange: (value: FielderValue) => void;
};

export function FielderField({ squad, suggestions, value, error, onChange }: FielderFieldProps) {
  const listId = useId();
  const [someoneElse, setSomeoneElse] = useState(value.fielderId === null && value.fielder.trim() !== "");
  const typed = (fielder: string) => onChange({ fielder, fielderId: null });

  if (squad.length === 0) {
    return (
      <>
        <NameField name="fielder" label={t("wicket.fielder")} value={value.fielder} error={error} list={listId} onChange={typed} />
        <NameSuggestions id={listId} names={suggestions} />
      </>
    );
  }

  function pick(id: string) {
    const chosen = squad.find((player) => player.id === id);
    setSomeoneElse(id === SOMEONE_ELSE);
    onChange({ fielder: chosen?.name ?? "", fielderId: chosen?.id ?? null });
  }

  return (
    <>
      <XiSelect
        name="fielder"
        label={t("wicket.fielder")}
        value={someoneElse ? SOMEONE_ELSE : (value.fielderId ?? "")}
        players={squad}
        labels={squadLabels(squad)}
        empty={t("wicket.noFielder")}
        extra={{ value: SOMEONE_ELSE, label: t("squad.someoneElse") }}
        onChange={pick}
      />
      {someoneElse && (
        <NameField name="fielderName" label={t("wicket.fielderName")} value={value.fielder} error={error} onChange={typed} />
      )}
    </>
  );
}
