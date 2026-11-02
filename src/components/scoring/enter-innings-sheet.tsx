"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { NameField, NameSuggestions, TeamCaption } from "@/components/scoring/name-field";
import { benchFor, choosePlayer, chooseTypedPlayer, suggestNames, xiFor } from "@/components/scoring/player-drafts";
import type { MatchTeam } from "@/components/scoring/player-drafts";
import { XiSelect, squadLabels } from "@/components/scoring/team-xi-picker";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { formatOvers, otherSide } from "@/lib/scoring";
import type { EventDraft, InningsState, MatchState, TeamSide } from "@/lib/scoring";
import { nameSchema, sameName } from "@/lib/validation/match-setup";
import { validateEnteredInnings } from "@/lib/validation/entered-innings";
import type { EnteredErrors } from "@/lib/validation/entered-innings";

const SOMEONE_ELSE = "someone-else";
const MAX_BOWLERS = 11;

type Row = { key: string; pick: string; name: string; overs: string; runs: string; wickets: string };
type Totals = { runs: string; wickets: string; overs: string };

function blankRow(): Row {
  return { key: crypto.randomUUID(), pick: "", name: "", overs: "", runs: "", wickets: "" };
}

function NumberField({ label, value, error, decimal, onChange }: { label: string; value: string; error?: string; decimal?: boolean; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode={decimal === true ? "decimal" : "numeric"}
        autoComplete="off"
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        onChange={(event) => onChange(event.target.value)}
        className="num h-12 rounded-xl px-3 md:text-base"
      />
      {error !== undefined && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function initialRows(state: MatchState, innings: InningsState | undefined, xi: readonly { id: string; name: string }[]): Row[] {
  if (innings === undefined || innings.bowling.length === 0) return [blankRow()];
  const { ballsPerOver } = state.rules;
  return innings.bowling.map((line) => {
    const name = state.players[line.playerId]?.name ?? "";
    const inXi = xi.some((player) => player.id === line.playerId);
    return {
      key: line.playerId,
      pick: xi.length === 0 ? "" : inXi ? line.playerId : SOMEONE_ELSE,
      name: inXi ? "" : name,
      overs: formatOvers(line.legalBalls, ballsPerOver),
      runs: String(line.runs),
      wickets: String(line.wickets),
    };
  });
}

type EnterInningsSheetProps = {
  state: MatchState;
  innings: 1 | 2;
  batting: TeamSide;
  existing?: InningsState;
  matchTeam?: MatchTeam;
  recent: readonly string[];
  busy: boolean;
  back: { label: string; onClick: () => void };
  undo?: ReactNode;
  onRecord: (drafts: EventDraft[]) => Promise<boolean>;
};

export function EnterInningsSheet({ state, innings, batting, existing, matchTeam, recent, busy, back, undo, onRecord }: EnterInningsSheetProps) {
  const bowling = otherSide(batting);
  const xi = xiFor(matchTeam, bowling);
  const labels = squadLabels(xi);
  const listId = useId();
  const [totals, setTotals] = useState<Totals>(() =>
    existing === undefined
      ? { runs: "", wickets: "", overs: "" }
      : { runs: String(existing.runs), wickets: String(existing.wickets), overs: formatOvers(existing.legalBalls, state.rules.ballsPerOver) },
  );
  const [rows, setRows] = useState<Row[]>(() => initialRows(state, existing, xi));
  const [errors, setErrors] = useState<EnteredErrors>({});
  const team = state.teams[batting].name;

  const setTotal = (field: keyof Totals) => (value: string) => {
    setTotals((current) => ({ ...current, [field]: value }));
    setErrors({});
  };
  const setRow = (index: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
    setErrors({});
  };

  function resolve(): { ids: string[]; drafts: EventDraft[]; problems: EnteredErrors } {
    const problems: EnteredErrors = {};
    const drafts: EventDraft[] = [];
    const typedNames: string[] = [];
    const ids = rows.map((row, index) => {
      const squadPick = xi.length > 0 && row.pick !== "" && row.pick !== SOMEONE_ELSE;
      if (squadPick) {
        const chosen = xi.find((player) => player.id === row.pick);
        if (chosen === undefined) return "";
        const choice = choosePlayer(state, bowling, chosen.name, chosen.id);
        drafts.push(...choice.drafts);
        return choice.id;
      }
      if (row.name.trim() === "") return "";
      const parsed = nameSchema.safeParse(row.name);
      if (!parsed.success) {
        problems[`${index}.player`] = parsed.error.issues[0]?.message;
        return "";
      }
      if (typedNames.some((name) => sameName(name, parsed.data))) {
        problems[`${index}.player`] = t("entered.error.sameBowler");
        return "";
      }
      typedNames.push(parsed.data);
      const choice = chooseTypedPlayer(state, bowling, parsed.data, xi, undefined, benchFor(matchTeam, bowling));
      if (choice === "ambiguous") {
        problems[`${index}.player`] = t("squad.error.ambiguousName", { name: parsed.data });
        return "";
      }
      drafts.push(...choice.drafts);
      return choice.id;
    });
    return { ids, drafts, problems };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { ids, drafts, problems } = resolve();
    const form = {
      ...totals,
      bowlers: rows.map((row, index) => ({
        player: ids[index] ?? "",
        overs: row.overs,
        runs: row.runs,
        wickets: row.wickets,
      })),
    };
    const checked = validateEnteredInnings(form, state.rules, batting);
    if (!checked.ok || Object.keys(problems).length > 0) {
      setErrors({ ...(checked.ok ? {} : checked.errors), ...problems });
      return;
    }
    void onRecord([...drafts, { type: "innings_entered", innings, battingTeam: batting, ...checked.value }]);
  }

  function playerField(row: Row, index: number) {
    const error = errors[`${index}.player`];
    if (xi.length === 0) {
      return (
        <NameField
          name={`bowler-${index}`}
          label={t("typed.bowler")}
          value={row.name}
          error={error}
          list={listId}
          onChange={(name) => setRow(index, { name })}
        />
      );
    }
    const someoneElse = row.pick === SOMEONE_ELSE;
    return (
      <>
        <XiSelect
          name={`bowler-${index}`}
          label={t("typed.bowler")}
          value={row.pick}
          players={xi}
          labels={labels}
          error={someoneElse ? undefined : error}
          extra={{ value: SOMEONE_ELSE, label: t("squad.someoneElse") }}
          onChange={(pick) => setRow(index, { pick })}
        />
        {someoneElse && (
          <NameField
            name={`bowler-${index}-name`}
            label={t("setup.typedName", { role: t("typed.bowler") })}
            value={row.name}
            error={error}
            onChange={(name) => setRow(index, { name })}
          />
        )}
      </>
    );
  }

  return (
    <Drawer open dismissible={false}>
      <DrawerContent className="mx-auto max-w-md data-[vaul-drawer-direction=bottom]:max-h-[92dvh]">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">
            <bdi>{t("typed.title", { team })}</bdi>
          </DrawerTitle>
          <DrawerDescription>{t("typed.hint")}</DrawerDescription>
          {innings === 2 && state.target !== null && (
            <p className="num text-base font-semibold">{t("score.target", { runs: state.target })}</p>
          )}
        </DrawerHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4 overflow-y-auto px-4">
          <fieldset aria-label={t("typed.total")} className="grid grid-cols-3 gap-2">
            <NumberField label={t("typed.runs")} value={totals.runs} error={errors.runs} onChange={setTotal("runs")} />
            <NumberField label={t("typed.wickets")} value={totals.wickets} error={errors.wickets} onChange={setTotal("wickets")} />
            <NumberField label={t("typed.overs")} value={totals.overs} error={errors.overs} decimal onChange={setTotal("overs")} />
          </fieldset>
          <TeamCaption prefix={t("setup.bowling")} team={state.teams[bowling].name} />
          {rows.map((row, index) => (
            <fieldset
              key={row.key}
              aria-label={t("typed.bowlerGroup", { n: index + 1 })}
              className="flex flex-col gap-2 rounded-2xl border p-3"
            >
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">{playerField(row, index)}</div>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={t("typed.removeBowler", { n: index + 1 })}
                    onClick={() => setRows((current) => current.filter((_, at) => at !== index))}
                  >
                    <X className="size-5" aria-hidden />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberField
                  label={t("typed.overs")}
                  value={row.overs}
                  error={errors[`${index}.overs`]}
                  decimal
                  onChange={(overs) => setRow(index, { overs })}
                />
                <NumberField label={t("typed.runs")} value={row.runs} error={errors[`${index}.runs`]} onChange={(runs) => setRow(index, { runs })} />
                <NumberField
                  label={t("typed.wickets")}
                  value={row.wickets}
                  error={errors[`${index}.wickets`]}
                  onChange={(wickets) => setRow(index, { wickets })}
                />
              </div>
            </fieldset>
          ))}
          {xi.length === 0 && <NameSuggestions id={listId} names={suggestNames(state, bowling, recent)} />}
          {rows.length < MAX_BOWLERS && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setRows((current) => [...current, blankRow()])}
              className="h-12 self-start rounded-xl"
            >
              <Plus className="size-5" aria-hidden />
              {t("typed.addBowler")}
            </Button>
          )}
          {errors.bowlers !== undefined && (
            <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-destructive">
              {errors.bowlers}
            </p>
          )}
          <Button type="submit" disabled={busy} className="mt-1 h-14 rounded-2xl text-base font-semibold">
            {t("typed.save")}
          </Button>
        </form>
        <DrawerFooter>
          <Button variant="ghost" disabled={busy} onClick={back.onClick} className="h-12 rounded-xl text-base font-semibold">
            {back.label}
          </Button>
          {undo}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
