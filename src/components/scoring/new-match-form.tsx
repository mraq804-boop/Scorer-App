"use client";

import { ChevronDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { SegmentedControl } from "@/components/segmented-control";
import { NameField, NameSuggestions, TeamCaption } from "@/components/scoring/name-field";
import { RulesFields, ToggleRow } from "@/components/scoring/rules-fields";
import type { TunableRules } from "@/components/scoring/rules-fields";
import { TeamXiPicker, XiSelect, squadLabels } from "@/components/scoring/team-xi-picker";
import { StorageError } from "@/components/storage-error";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";
import { checkStorage, getLocalDb, requestPersist } from "@/lib/local/db";
import type { CachedFixture, CachedTeam, StorageCheck } from "@/lib/local/db";
import { createLocalMatch, recentPlayerNames } from "@/lib/local/matches";
import type { SetupPlayer } from "@/lib/local/matches";
import { defaultRules, otherSide } from "@/lib/scoring";
import type { BallType, Rules, TeamSide } from "@/lib/scoring";
import type { SquadPlayer } from "@/lib/team";
import { getCachedTeam } from "@/lib/team/local";
import { OVERS_MAX, OVERS_MIN, PLAYERS_MAX, PLAYERS_MIN, validateMatchSetup } from "@/lib/validation/match-setup";
import type { MatchSetupErrors, MatchSetupField } from "@/lib/validation/match-setup";

type Choice = "bat" | "bowl";

type Values = {
  teamA: string;
  teamB: string;
  ballType: BallType;
  overs: string;
  touched: Partial<Omit<TunableRules, "playersPerSide">>;
  touchedPlayers: Partial<Record<TeamSide, number>>;
  winner: TeamSide;
  choice: Choice;
  striker: string;
  nonStriker: string;
  bowler: string;
  playingTeam: boolean;
  xi: string[];
  pickedStriker: string;
  pickedNonStriker: string;
  pickedBowler: string;
};

const INITIAL: Values = {
  teamA: "",
  teamB: "",
  ballType: "tape",
  overs: "10",
  touched: {},
  touchedPlayers: {},
  winner: "A",
  choice: "bat",
  striker: "",
  nonStriker: "",
  bowler: "",
  playingTeam: false,
  xi: [],
  pickedStriker: "",
  pickedNonStriker: "",
  pickedBowler: "",
};

const FOCUS_ORDER: readonly MatchSetupField[] = ["teamA", "teamB", "overs", "xi", "striker", "nonStriker", "bowler"];
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

function initialValues(team: CachedTeam | undefined, fixture: CachedFixture | undefined): Values {
  return {
    ...INITIAL,
    teamB: fixture?.opponent ?? INITIAL.teamB,
    overs: fixture?.overs == null ? INITIAL.overs : String(fixture.overs),
    playingTeam: team !== undefined,
  };
}

function pickError(error: string | undefined, picked: string): string | undefined {
  return error !== undefined && picked === "" ? t("setup.error.pickPlayer") : error;
}

type SetupFormProps = { players: string[]; team: CachedTeam | undefined; fixture: CachedFixture | undefined };

function SetupForm({ players, team, fixture }: SetupFormProps) {
  const [values, setValues] = useState<Values>(() => initialValues(team, fixture));
  const [squad, setSquad] = useState<SquadPlayer[]>(() => team?.squad.filter((player) => player.active) ?? []);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const oversId = useId();

  const update = (patch: Partial<Values>) => setValues((current) => ({ ...current, ...patch }));
  const setRule: <K extends keyof TunableRules>(key: K, value: TunableRules[K]) => void = (key, value) =>
    setValues((current) => {
      if (key !== "playersPerSide") return { ...current, touched: { ...current.touched, [key]: value } };
      const players = value as Rules["playersPerSide"];
      const changed = (["A", "B"] as const).filter((side) => players[side] !== rules.playersPerSide[side]);
      return { ...current, touchedPlayers: { ...current.touchedPlayers, ...Object.fromEntries(changed.map((side) => [side, players[side]])) } };
    });
  const toggleXi = (id: string) =>
    setValues((current) => {
      const leaving = current.xi.includes(id);
      const keep = (picked: string) => (leaving && picked === id ? "" : picked);
      return {
        ...current,
        xi: leaving ? current.xi.filter((member) => member !== id) : [...current.xi, id],
        pickedStriker: keep(current.pickedStriker),
        pickedNonStriker: keep(current.pickedNonStriker),
        pickedBowler: keep(current.pickedBowler),
      };
    });
  const addToXi = (player: SquadPlayer) => {
    setSquad((current) => [...current, player]);
    setValues((current) => ({ ...current, xi: [...current.xi, player.id] }));
  };

  const overs = values.overs.trim() === "" ? Number.NaN : Number(values.overs);
  const playing = values.playingTeam ? team : undefined;
  const xiPlayers = squad.filter((player) => values.xi.includes(player.id));
  const defaults = defaultRules(values.ballType, overs);
  const xiPlayersA = playing === undefined ? {} : { A: Math.min(PLAYERS_MAX, Math.max(PLAYERS_MIN, xiPlayers.length)) };
  const rules: Rules = {
    ...defaults,
    ...values.touched,
    playersPerSide: { ...defaults.playersPerSide, ...xiPlayersA, ...values.touchedPlayers },
  };
  const battingSide = values.choice === "bat" ? values.winner : otherSide(values.winner);
  const teamBatting = playing !== undefined && battingSide === "A";
  const teamBowling = playing !== undefined && battingSide === "B";
  const labels = squadLabels(squad);
  const pickFor = (id: string): SetupPlayer => {
    const chosen = xiPlayers.find((player) => player.id === id);
    return chosen === undefined ? "" : { id: chosen.id, name: chosen.name };
  };
  const candidate = {
    teams: [playing?.name ?? values.teamA, values.teamB],
    rules,
    toss: { winner: values.winner, choice: values.choice },
    striker: teamBatting ? pickFor(values.pickedStriker) : values.striker,
    nonStriker: teamBatting ? pickFor(values.pickedNonStriker) : values.nonStriker,
    bowler: teamBowling ? pickFor(values.pickedBowler) : values.bowler,
    ...(playing === undefined
      ? {}
      : { team: { id: playing.id, fixtureId: fixture?.id ?? null, xi: xiPlayers.map(({ id, name }) => ({ id, name })) } }),
  };
  const validation = attempted ? validateMatchSetup(candidate) : null;
  const errors: MatchSetupErrors = validation !== null && !validation.ok ? validation.errors : {};

  const teamNames = {
    A: playing?.name ?? (values.teamA.trim() || t("setup.teamA")),
    B: values.teamB.trim() || t("setup.teamB"),
  };

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
      void requestPersist();
      const match = await createLocalMatch(getLocalDb(), result.setup);
      location.assign(`/score?m=${match.id}`);
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-1 flex-col gap-6">
      {team !== undefined && (
        <ToggleRow label={t("setup.myTeam")} checked={values.playingTeam} onChange={(playingTeam) => update({ playingTeam })} />
      )}

      <section className="flex flex-col gap-3">
        {playing === undefined ? (
          <NameField name="teamA" label={t("setup.teamA")} value={values.teamA} error={errors.teamA} onChange={(teamA) => update({ teamA })} />
        ) : (
          <NameField name="teamA" label={t("setup.teamA")} value={playing.name} readOnly />
        )}
        <NameField name="teamB" label={t("setup.teamB")} value={values.teamB} error={errors.teamB} onChange={(teamB) => update({ teamB })} />
        {playing !== undefined && fixture?.ground != null && <TeamCaption prefix={t("setup.ground")} team={fixture.ground} />}
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

      {playing !== undefined && (
        <TeamXiPicker squad={squad} labels={labels} selected={values.xi} error={errors.xi} onToggle={toggleXi} onAdded={addToXi} />
      )}

      <section className="flex flex-col gap-3">
        <TeamCaption prefix={t("setup.batting")} team={teamNames[battingSide]} />
        {teamBatting ? (
          <>
            <XiSelect
              name="striker"
              label={t("setup.striker")}
              value={values.pickedStriker}
              players={xiPlayers}
              labels={labels}
              error={pickError(errors.striker, values.pickedStriker)}
              onChange={(pickedStriker) => update({ pickedStriker })}
            />
            <XiSelect
              name="nonStriker"
              label={t("setup.nonStriker")}
              value={values.pickedNonStriker}
              players={xiPlayers}
              labels={labels}
              error={pickError(errors.nonStriker, values.pickedNonStriker)}
              onChange={(pickedNonStriker) => update({ pickedNonStriker })}
            />
          </>
        ) : (
          <>
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
          </>
        )}
        <TeamCaption prefix={t("setup.bowling")} team={teamNames[otherSide(battingSide)]} />
        {teamBowling ? (
          <XiSelect
            name="bowler"
            label={t("setup.bowler")}
            value={values.pickedBowler}
            players={xiPlayers}
            labels={labels}
            error={pickError(errors.bowler, values.pickedBowler)}
            onChange={(pickedBowler) => update({ pickedBowler })}
          />
        ) : (
          <NameField
            name="bowler"
            label={t("setup.bowler")}
            value={values.bowler}
            error={errors.bowler}
            list={PLAYERS_LIST_ID}
            onChange={(bowler) => update({ bowler })}
          />
        )}
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
  const fixtureId = useSearchParams().get("fixture");
  const [storage, setStorage] = useState<StorageCheck | null>(null);
  const [players, setPlayers] = useState<string[]>([]);
  const [team, setTeam] = useState<CachedTeam | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void (async () => {
      const check = await checkStorage();
      if (!active) return;
      if (!check.ok) {
        setStorage(check);
        return;
      }
      const cached = await getCachedTeam(getLocalDb()).catch(() => undefined);
      if (!active) return;
      setTeam(cached);
      setStorage(check);
      const recent = await recentPlayerNames(getLocalDb()).catch(() => []);
      if (active) setPlayers(recent);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (storage === null) return null;
  if (!storage.ok) return <StorageError reason={storage.reason} />;
  const fixture = team?.fixtures.find((candidate) => candidate.id === fixtureId);
  return <SetupForm players={players} team={team} fixture={fixture} />;
}
