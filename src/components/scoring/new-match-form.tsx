"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { SegmentedControl } from "@/components/segmented-control";
import { NameField, NameSuggestions, TeamCaption } from "@/components/scoring/name-field";
import { RulesFields } from "@/components/scoring/rules-fields";
import type { TunableRules } from "@/components/scoring/rules-fields";
import { StorageError } from "@/components/storage-error";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";
import { checkStorage, getLocalDb, requestPersist } from "@/lib/local/db";
import type { StorageCheck } from "@/lib/local/db";
import { createLocalMatch, recentPlayerNames } from "@/lib/local/matches";
import { defaultRules, otherSide } from "@/lib/scoring";
import type { BallType, Rules, TeamSide } from "@/lib/scoring";
import { OVERS_MAX, OVERS_MIN, validateMatchSetup } from "@/lib/validation/match-setup";
import type { MatchSetupErrors, MatchSetupField } from "@/lib/validation/match-setup";

type Choice = "bat" | "bowl";

type Values = {
  teamA: string;
  teamB: string;
  ballType: BallType;
  overs: string;
  touched: Partial<TunableRules>;
  winner: TeamSide;
  choice: Choice;
  striker: string;
  nonStriker: string;
  bowler: string;
};

const INITIAL: Values = {
  teamA: "",
  teamB: "",
  ballType: "tape",
  overs: "10",
  touched: {},
  winner: "A",
  choice: "bat",
  striker: "",
  nonStriker: "",
  bowler: "",
};

const FOCUS_ORDER: readonly MatchSetupField[] = ["teamA", "teamB", "overs", "striker", "nonStriker", "bowler"];
const PLAYERS_LIST_ID = "recent-players";

const BALL_TYPES = [
  { value: "tape", label: t("setup.ball.tape") },
  { value: "tennis", label: t("setup.ball.tennis") },
  { value: "hard", label: t("setup.ball.hard") },
  { value: "custom", label: t("setup.ball.custom") },
] as const;

const OVERS_CHIPS = [
  { overs: 10, label: t("setup.overs.t10") },
  { overs: 20, label: t("setup.overs.t20") },
  { overs: 50, label: t("setup.overs.fifty") },
] as const;

const CHOICES = [
  { value: "bat", label: t("setup.choice.bat") },
  { value: "bowl", label: t("setup.choice.bowl") },
] as const;

function focusFirstInvalid(form: HTMLFormElement, errors: MatchSetupErrors) {
  const first = FOCUS_ORDER.find((field) => errors[field] !== undefined);
  const control = first === undefined ? null : form.elements.namedItem(first);
  if (control instanceof HTMLElement) control.focus();
}

function SetupForm({ players }: { players: string[] }) {
  const [values, setValues] = useState<Values>(INITIAL);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const oversId = useId();

  const update = (patch: Partial<Values>) => setValues((current) => ({ ...current, ...patch }));
  const setRule: <K extends keyof TunableRules>(key: K, value: TunableRules[K]) => void = (key, value) =>
    setValues((current) => ({ ...current, touched: { ...current.touched, [key]: value } }));

  const overs = values.overs.trim() === "" ? Number.NaN : Number(values.overs);
  const rules: Rules = { ...defaultRules(values.ballType, overs), ...values.touched };
  const candidate = {
    teams: [values.teamA, values.teamB],
    rules,
    toss: { winner: values.winner, choice: values.choice },
    striker: values.striker,
    nonStriker: values.nonStriker,
    bowler: values.bowler,
  };
  const validation = attempted ? validateMatchSetup(candidate) : null;
  const errors: MatchSetupErrors = validation !== null && !validation.ok ? validation.errors : {};

  const teamNames = { A: values.teamA.trim() || t("setup.teamA"), B: values.teamB.trim() || t("setup.teamB") };
  const battingSide = values.choice === "bat" ? values.winner : otherSide(values.winner);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setAttempted(true);
    const result = validateMatchSetup(candidate);
    if (!result.ok) {
      focusFirstInvalid(event.currentTarget, result.errors);
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    try {
      await requestPersist();
      const match = await createLocalMatch(getLocalDb(), result.setup);
      location.assign(`/score?m=${match.id}`);
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-1 flex-col gap-6">
      <section className="flex flex-col gap-3">
        <NameField name="teamA" label={t("setup.teamA")} value={values.teamA} error={errors.teamA} onChange={(teamA) => update({ teamA })} />
        <NameField name="teamB" label={t("setup.teamB")} value={values.teamB} error={errors.teamB} onChange={(teamB) => update({ teamB })} />
      </section>

      <SegmentedControl
        label={t("setup.ball")}
        value={values.ballType}
        options={BALL_TYPES}
        onChange={(ballType) => update({ ballType })}
      />

      <section role="group" aria-labelledby={`${oversId}-label`} className="flex flex-col gap-2">
        <span id={`${oversId}-label`} className="text-sm font-medium">
          {t("setup.overs")}
        </span>
        <div className="flex items-center gap-2">
          {OVERS_CHIPS.map((chip) => (
            <Button
              key={chip.overs}
              type="button"
              variant={overs === chip.overs ? "default" : "outline"}
              aria-pressed={overs === chip.overs}
              className="num h-11 rounded-xl px-4 font-semibold"
              onClick={() => update({ overs: String(chip.overs) })}
            >
              {chip.label}
            </Button>
          ))}
          <Input
            name="overs"
            type="number"
            inputMode="numeric"
            min={OVERS_MIN}
            max={OVERS_MAX}
            step={1}
            aria-label={t("setup.overs.custom")}
            aria-invalid={errors.overs === undefined ? undefined : true}
            aria-describedby={errors.overs === undefined ? undefined : `${oversId}-error`}
            value={values.overs}
            onChange={(event) => update({ overs: event.target.value })}
            className="num h-11 min-w-0 flex-1 rounded-xl px-3 text-center md:text-base"
          />
        </div>
        {errors.overs !== undefined && (
          <p id={`${oversId}-error`} className="text-sm text-destructive">
            {errors.overs}
          </p>
        )}
      </section>

      <Collapsible open={rulesOpen} onOpenChange={setRulesOpen} className="rounded-2xl border bg-card">
        <CollapsibleTrigger className="group flex h-14 w-full items-center justify-between gap-3 px-4 text-start font-semibold">
          {t("setup.rules")}
          <ChevronDown className="size-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4">
          <RulesFields rules={rules} onChange={setRule} />
        </CollapsibleContent>
      </Collapsible>

      <section className="flex flex-col gap-3">
        <SegmentedControl
          label={t("setup.toss")}
          value={values.winner}
          options={[
            { value: "A", label: teamNames.A },
            { value: "B", label: teamNames.B },
          ]}
          onChange={(winner) => update({ winner })}
        />
        <SegmentedControl label={t("setup.tossChoice")} value={values.choice} options={CHOICES} onChange={(choice) => update({ choice })} />
      </section>

      <section className="flex flex-col gap-3">
        <TeamCaption prefix={t("setup.batting")} team={teamNames[battingSide]} />
        <NameField
          name="striker"
          label={t("setup.striker")}
          value={values.striker}
          error={errors.striker}
          list={PLAYERS_LIST_ID}
          onChange={(striker) => update({ striker })}
        />
        <NameField
          name="nonStriker"
          label={t("setup.nonStriker")}
          value={values.nonStriker}
          error={errors.nonStriker}
          list={PLAYERS_LIST_ID}
          onChange={(nonStriker) => update({ nonStriker })}
        />
        <TeamCaption prefix={t("setup.bowling")} team={teamNames[otherSide(battingSide)]} />
        <NameField
          name="bowler"
          label={t("setup.bowler")}
          value={values.bowler}
          error={errors.bowler}
          list={PLAYERS_LIST_ID}
          onChange={(bowler) => update({ bowler })}
        />
        <NameSuggestions id={PLAYERS_LIST_ID} names={players} />
      </section>

      <div className="sticky bottom-0 -mx-4 mt-auto border-t bg-background/95 px-4 backdrop-blur pb-safe">
        <div className="flex flex-col gap-2 py-3">
          {errors.form !== undefined && (
            <p role="alert" className="text-sm text-destructive">
              {errors.form}
            </p>
          )}
          {saveFailed && (
            <p role="alert" className="text-sm text-destructive">
              {t("setup.saveFailed")}
            </p>
          )}
          <Button type="submit" disabled={saving} className="h-14 w-full rounded-2xl text-base font-semibold">
            {saving ? t("setup.starting") : t("setup.start")}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function NewMatchForm() {
  const [storage, setStorage] = useState<StorageCheck | null>(null);
  const [players, setPlayers] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const check = await checkStorage();
      if (!active) return;
      setStorage(check);
      if (!check.ok) return;
      const recent = await recentPlayerNames(getLocalDb()).catch(() => []);
      if (active) setPlayers(recent);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (storage === null) return null;
  if (!storage.ok) return <StorageError reason={storage.reason} />;
  return <SetupForm players={players} />;
}
