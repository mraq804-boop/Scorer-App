"use client";

import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { NameField, NameSuggestions, TeamCaption } from "@/components/scoring/name-field";
import { benchFor, choosePlayer, chooseTypedPlayer, suggestNames, xiFor } from "@/components/scoring/player-drafts";
import type { MatchTeam, PlayerChoice } from "@/components/scoring/player-drafts";
import { XiSelect, squadLabels } from "@/components/scoring/team-xi-picker";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import { otherSide } from "@/lib/scoring";
import type { EventDraft, MatchState, TeamSide } from "@/lib/scoring";
import { nameSchema, sameName } from "@/lib/validation/match-setup";

type Field = "striker" | "nonStriker" | "bowler";
type Values = Record<Field, string>;
type Opener = { name: string; squad: boolean; choice: PlayerChoice };

const SOMEONE_ELSE = "someone-else";

function sameOpener(first: Opener, second: Opener): boolean {
  if (first.choice.id === second.choice.id) return true;
  return !first.squad && !second.squad && sameName(first.name, second.name);
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
  const [picks, setPicks] = useState<Values>({ striker: "", nonStriker: "", bowler: "" });
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
  const sideOf = (name: Field) => (name === "bowler" ? bowling : batting);

  const change = (set: typeof setValues, name: Field) => (value: string) => {
    set((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  function renderField(name: Field, label: string, listId: string, labels: ReadonlyMap<string, string>) {
    const squad = squadOf(name);
    if (squad.length === 0) {
      return (
        <NameField name={name} label={label} value={values[name]} error={errors[name]} list={listId} onChange={change(setValues, name)} />
      );
    }
    const someoneElse = picks[name] === SOMEONE_ELSE;
    return (
      <>
        <XiSelect
          name={name}
          label={label}
          value={picks[name]}
          players={squad}
          labels={labels}
          error={someoneElse ? undefined : errors[name]}
          extra={{ value: SOMEONE_ELSE, label: t("squad.someoneElse") }}
          onChange={change(setPicks, name)}
        />
        {someoneElse && (
          <NameField
            name={`${name}Name`}
            label={t("setup.typedName", { role: label })}
            value={values[name]}
            error={errors[name]}
            onChange={change(setValues, name)}
          />
        )}
      </>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    const pick = (name: Field): Opener | undefined => {
      const squad = squadOf(name);
      const side = sideOf(name);
      if (squad.length > 0 && picks[name] !== SOMEONE_ELSE) {
        const chosen = squad.find((player) => player.id === picks[name]);
        if (chosen === undefined) {
          next[name] = t("setup.error.pickPlayer");
          return undefined;
        }
        return { name: chosen.name, squad: true, choice: choosePlayer(state, side, chosen.name, chosen.id) };
      }
      const parsed = nameSchema.safeParse(values[name]);
      if (!parsed.success) {
        next[name] = parsed.error.issues[0]?.message;
        return undefined;
      }
      const choice = chooseTypedPlayer(state, side, parsed.data, squad, undefined, benchFor(matchTeam, side));
      if (choice === "ambiguous") {
        next[name] = t("squad.error.ambiguousName", { name: parsed.data });
        return undefined;
      }
      return { name: parsed.data, squad: squad.some((player) => player.id === choice.id), choice };
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
    void onRecord([
      ...first.choice.drafts,
      ...second.choice.drafts,
      ...opening.choice.drafts,
      {
        type: "innings_started",
        innings,
        battingTeam: batting,
        striker: first.choice.id,
        nonStriker: second.choice.id,
        bowler: opening.choice.id,
      },
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
          {renderField("striker", t("setup.striker"), battingListId, battingLabels)}
          {renderField("nonStriker", t("setup.nonStriker"), battingListId, battingLabels)}
          {battingXi.length === 0 && <NameSuggestions id={battingListId} names={suggestNames(state, batting, recent)} />}
          <TeamCaption prefix={t("setup.bowling")} team={state.teams[bowling].name} />
          {renderField("bowler", t("setup.bowler"), bowlingListId, bowlingLabels)}
          {bowlingXi.length === 0 && <NameSuggestions id={bowlingListId} names={suggestNames(state, bowling, recent)} />}
          <Button type="submit" disabled={busy} className="mt-1 h-14 rounded-2xl text-base font-semibold">
            {t("innings.start")}
          </Button>
        </form>
        <DrawerFooter>{undo}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
