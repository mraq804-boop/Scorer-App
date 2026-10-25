"use client";

import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { z } from "zod";
import { NameField, NameSuggestions, TeamCaption } from "@/components/scoring/name-field";
import { choosePlayer, suggestNames } from "@/components/scoring/player-drafts";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import { otherSide } from "@/lib/scoring";
import type { EventDraft, MatchState, TeamSide } from "@/lib/scoring";
import { nameSchema, sameName } from "@/lib/validation/match-setup";

type Field = "striker" | "nonStriker" | "bowler";
type Values = Record<Field, string>;

const openersSchema = z
  .object({ striker: nameSchema, nonStriker: nameSchema, bowler: nameSchema })
  .refine(({ striker, nonStriker }) => striker === "" || nonStriker === "" || !sameName(striker, nonStriker), {
    path: ["nonStriker"],
    error: t("setup.error.sameOpener"),
  });

function battingSide(state: MatchState, innings: 1 | 2): TeamSide {
  const first = state.innings.find((candidate) => candidate.number === 1);
  if (innings === 2 && first !== undefined) return otherSide(first.battingTeam);
  if (state.toss === null) return "A";
  return state.toss.choice === "bat" ? state.toss.winner : otherSide(state.toss.winner);
}

type StartInningsSheetProps = {
  state: MatchState;
  innings: 1 | 2;
  recent: readonly string[];
  busy: boolean;
  undo: ReactNode;
  onRecord: (drafts: EventDraft[]) => Promise<boolean>;
};

export function StartInningsSheet({ state, innings, recent, busy, undo, onRecord }: StartInningsSheetProps) {
  const [values, setValues] = useState<Values>({ striker: "", nonStriker: "", bowler: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const battingListId = useId();
  const bowlingListId = useId();
  const batting = battingSide(state, innings);
  const bowling = otherSide(batting);

  const field = (name: Field) => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (value: string) => {
      setValues((current) => ({ ...current, [name]: value }));
      setErrors((current) => ({ ...current, [name]: undefined }));
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = openersSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Field] ??= issue.message;
      setErrors(next);
      return;
    }
    const striker = choosePlayer(state, batting, parsed.data.striker);
    const nonStriker = choosePlayer(state, batting, parsed.data.nonStriker);
    const bowler = choosePlayer(state, bowling, parsed.data.bowler);
    void onRecord([
      ...striker.drafts,
      ...nonStriker.drafts,
      ...bowler.drafts,
      { type: "innings_started", innings, battingTeam: batting, striker: striker.id, nonStriker: nonStriker.id, bowler: bowler.id },
    ]);
  }

  return (
    <Drawer open dismissible={false}>
      <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t("innings.title", { n: innings })}</DrawerTitle>
          {innings === 2 && state.target !== null && (
            <p className="num text-base font-semibold">{t("score.target", { runs: state.target })}</p>
          )}
        </DrawerHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-3 overflow-y-auto px-4">
          <TeamCaption prefix={t("setup.batting")} team={state.teams[batting].name} />
          <NameField label={t("setup.striker")} list={battingListId} {...field("striker")} />
          <NameField label={t("setup.nonStriker")} list={battingListId} {...field("nonStriker")} />
          <TeamCaption prefix={t("setup.bowling")} team={state.teams[bowling].name} />
          <NameField label={t("setup.bowler")} list={bowlingListId} {...field("bowler")} />
          <NameSuggestions id={battingListId} names={suggestNames(state, batting, recent)} />
          <NameSuggestions id={bowlingListId} names={suggestNames(state, bowling, recent)} />
          <Button type="submit" disabled={busy} className="mt-1 h-14 rounded-2xl text-base font-semibold">
            {t("innings.start")}
          </Button>
        </form>
        <DrawerFooter>{undo}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
