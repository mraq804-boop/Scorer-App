"use client";

import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { NameField, NameSuggestions } from "@/components/scoring/name-field";
import { choosePlayer, chooseTypedPlayer, suggestNames, xiFor } from "@/components/scoring/player-drafts";
import type { MatchTeam, XiPlayer } from "@/components/scoring/player-drafts";
import { squadLabels } from "@/components/scoring/team-xi-picker";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import type { EventDraft, InningsState, MatchState } from "@/lib/scoring";
import { nameSchema, sameName } from "@/lib/validation/match-setup";

type BatterSheetProps = {
  state: MatchState;
  innings: InningsState;
  matchTeam?: MatchTeam;
  recent: readonly string[];
  busy: boolean;
  undo: ReactNode;
  onRecord: (drafts: EventDraft[]) => Promise<boolean>;
};

export function BatterSheet({ state, innings, matchTeam, recent, busy, undo, onRecord }: BatterSheetProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const listId = useId();
  const squadId = useId();
  const team = innings.battingTeam;
  const xi = xiFor(matchTeam, team);
  const labels = squadLabels(xi);
  const atCrease = [innings.striker, innings.nonStriker].filter((id) => id !== null);
  const lines = new Map(innings.batting.map((line) => [line.playerId, line]));
  const returning = innings.batting.filter(
    (line) => line.retiredHurt && line.out === null && !atCrease.includes(line.playerId),
  );

  const squad = xi.filter((player) => !lines.has(player.id));

  const sendIn = (player: string, added: EventDraft[] = []) => void onRecord([...added, { type: "batter_in", player }]);

  function sendSquadPlayer(player: XiPlayer) {
    const choice = choosePlayer(state, team, player.name, player.id);
    sendIn(choice.id, choice.drafts);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    const batting = atCrease.map((id) => state.players[id]).find((player) => player && sameName(player.name, parsed.data));
    if (batting !== undefined) {
      setError(t("batter.alreadyIn", { name: batting.name }));
      return;
    }
    const choice = chooseTypedPlayer(state, team, parsed.data, xi, (player) => {
      const line = lines.get(player.id);
      return line === undefined || (line.retiredHurt && line.out === null);
    });
    if (choice === "ambiguous") {
      setError(t("squad.error.ambiguousName", { name: parsed.data }));
      return;
    }
    sendIn(choice.id, choice.drafts);
  }

  return (
    <Drawer open dismissible={false}>
      <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t("batter.title")}</DrawerTitle>
        </DrawerHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4 overflow-y-auto px-4">
          {returning.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("batter.returning")}</h3>
              {returning.map((line) => (
                <Button
                  key={line.playerId}
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => sendIn(line.playerId)}
                  className="h-12 justify-start rounded-xl text-base"
                >
                  <bdi className="truncate">{state.players[line.playerId]?.name}</bdi>
                </Button>
              ))}
            </section>
          )}
          {squad.length > 0 && (
            <div role="group" aria-labelledby={squadId} className="flex flex-col gap-2">
              <h3 id={squadId} className="text-sm font-medium">
                {t("setup.xi")}
              </h3>
              {squad.map((player) => (
                <Button
                  key={player.id}
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => sendSquadPlayer(player)}
                  className="h-12 justify-start rounded-xl text-base"
                >
                  <bdi className="truncate">{labels.get(player.id)}</bdi>
                </Button>
              ))}
            </div>
          )}
          <NameField
            name="batter"
            label={t("batter.name")}
            value={name}
            error={error}
            list={listId}
            onChange={(value) => {
              setName(value);
              setError(undefined);
            }}
          />
          <NameSuggestions id={listId} names={suggestNames(state, team, recent, (player) => lines.has(player.id))} />
          <Button type="submit" disabled={busy} className="h-14 rounded-2xl text-base font-semibold">
            {t("batter.sendIn")}
          </Button>
        </form>
        <DrawerFooter>{undo}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
