"use client";

import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { NameField, NameSuggestions, TeamCaption } from "@/components/scoring/name-field";
import { choosePlayer, suggestNames, xiFor } from "@/components/scoring/player-drafts";
import type { MatchTeam } from "@/components/scoring/player-drafts";
import { XiSelect, squadLabels } from "@/components/scoring/team-xi-picker";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import { otherSide } from "@/lib/scoring";
import type { EventDraft, MatchState, TeamSide } from "@/lib/scoring";
import { nameSchema, sameName } from "@/lib/validation/match-setup";

type Field = "striker" | "nonStriker" | "bowler";
type Values = Record<Field, string>;
type Opener = { name: string; squadId?: string };

function sameOpener(first: Opener, second: Opener): boolean {
  if (first.squadId !== undefined && second.squadId !== undefined) return first.squadId === second.squadId;
  return sameName(first.name, second.name);
}

function battingSide(state: MatchState, innings: 1 | 2): TeamSide {
  const first = state.innings.find((candidate) => candidate.number === 1);
  if (innings === 2 && first !== undefined) return otherSide(first.battingTeam);
  if (state.toss === null) return "A";
  return state.toss.choice === "bat" ? state.toss.winner : otherSide(state.toss.winner);
}

type StartInningsSheetProps = {
  state: MatchState;
  innings: 1 | 2;
  matchTeam?: MatchTeam;
  recent: readonly string[];
  busy: boolean;
  undo: ReactNode;
  onRecord: (drafts: EventDraft[]) => Promise<boolean>;
};

export function StartInningsSheet({ state, innings, matchTeam, recent, busy, undo, onRecord }: StartInningsSheetProps) {
  const [values, setValues] = useState<Values>({ striker: "", nonStriker: "", bowler: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const battingListId = useId();
  const bowlingListId = useId();
  const batting = battingSide(state, innings);
  const bowling = otherSide(batting);
  const battingXi = xiFor(matchTeam, batting);
  const bowlingXi = xiFor(matchTeam, bowling);
  const battingLabels = squadLabels(battingXi);
  const bowlingLabels = squadLabels(bowlingXi);
  const squadOf = (name: Field) => (name === "bowler" ? bowlingXi : battingXi);

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
    const next: Partial<Record<Field, string>> = {};
    const pick = (name: Field): Opener | undefined => {
      const squad = squadOf(name);
      if (squad.length > 0) {
        const chosen = squad.find((player) => player.id === values[name]);
        if (chosen === undefined) next[name] = t("setup.error.pickPlayer");
        return chosen === undefined ? undefined : { name: chosen.name, squadId: chosen.id };
      }
      const parsed = nameSchema.safeParse(values[name]);
      if (!parsed.success) next[name] = parsed.error.issues[0]?.message;
      return parsed.success ? { name: parsed.data } : undefined;
    };
    const first = pick("striker");
    const second = pick("nonStriker");
    const opening = pick("bowler");
    if (first !== undefined && second !== undefined && sameOpener(first, second)) {
      next.nonStriker = t("setup.error.sameOpener");
    }
    if (first === undefined || second === undefined || opening === undefined || next.nonStriker !== undefined) {
      setErrors(next);
      return;
    }
    const striker = choosePlayer(state, batting, first.name, first.squadId);
    const nonStriker = choosePlayer(state, batting, second.name, second.squadId);
    const bowler = choosePlayer(state, bowling, opening.name, opening.squadId);
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
          {battingXi.length > 0 ? (
            <>
              <XiSelect label={t("setup.striker")} players={battingXi} labels={battingLabels} {...field("striker")} />
              <XiSelect label={t("setup.nonStriker")} players={battingXi} labels={battingLabels} {...field("nonStriker")} />
            </>
          ) : (
            <>
              <NameField label={t("setup.striker")} list={battingListId} {...field("striker")} />
              <NameField label={t("setup.nonStriker")} list={battingListId} {...field("nonStriker")} />
              <NameSuggestions id={battingListId} names={suggestNames(state, batting, recent)} />
            </>
          )}
          <TeamCaption prefix={t("setup.bowling")} team={state.teams[bowling].name} />
          {bowlingXi.length > 0 ? (
            <XiSelect label={t("setup.bowler")} players={bowlingXi} labels={bowlingLabels} {...field("bowler")} />
          ) : (
            <>
              <NameField label={t("setup.bowler")} list={bowlingListId} {...field("bowler")} />
              <NameSuggestions id={bowlingListId} names={suggestNames(state, bowling, recent)} />
            </>
          )}
          <Button type="submit" disabled={busy} className="mt-1 h-14 rounded-2xl text-base font-semibold">
            {t("innings.start")}
          </Button>
        </form>
        <DrawerFooter>{undo}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
