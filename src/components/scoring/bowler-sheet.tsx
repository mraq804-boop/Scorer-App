"use client";

import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { NameField, NameSuggestions } from "@/components/scoring/name-field";
import { choosePlayer, chooseTypedPlayer, previousBowlers, suggestNames, xiFor } from "@/components/scoring/player-drafts";
import type { MatchTeam, XiPlayer } from "@/components/scoring/player-drafts";
import { squadLabels } from "@/components/scoring/team-xi-picker";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import { formatFigures } from "@/lib/i18n/cricket";
import type { EventDraft, InningsState, MatchState } from "@/lib/scoring";
import { nameSchema } from "@/lib/validation/match-setup";

type BowlerSheetProps = {
  state: MatchState;
  innings: InningsState;
  matchTeam?: MatchTeam;
  recent: readonly string[];
  busy: boolean;
  undo?: ReactNode;
  title?: string;
  onClose?: () => void;
  onRecord: (drafts: EventDraft[]) => Promise<boolean>;
};

export function BowlerSheet({
  state,
  innings,
  matchTeam,
  recent,
  busy,
  undo,
  title = t("bowler.title"),
  onClose,
  onRecord,
}: BowlerSheetProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const listId = useId();
  const squadId = useId();
  const team = innings.bowlingTeam;
  const bowled = new Set(innings.bowling.map((line) => line.playerId));
  const xi = xiFor(matchTeam, team);
  const labels = squadLabels(xi);
  const squad = xi.filter((player) => !bowled.has(player.id));

  const bowl = (player: string, added: EventDraft[] = []) => void onRecord([...added, { type: "bowler_changed", player }]);
  const previous = previousBowlers(innings);

  function bowlSquadPlayer(player: XiPlayer) {
    const choice = choosePlayer(state, team, player.name, player.id);
    bowl(choice.id, choice.drafts);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    const choice = chooseTypedPlayer(state, team, parsed.data, xi);
    if (choice === "ambiguous") {
      setError(t("squad.error.ambiguousName", { name: parsed.data }));
      return;
    }
    bowl(choice.id, choice.drafts);
  }

  return (
    <Drawer open dismissible={onClose !== undefined} onOpenChange={(open) => !open && onClose?.()}>
      <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{title}</DrawerTitle>
        </DrawerHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4 overflow-y-auto px-4">
          {previous.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("bowler.previous")}</h3>
              {previous.map((line) => (
                <Button
                  key={line.playerId}
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => bowl(line.playerId)}
                  className="h-12 justify-between gap-3 rounded-xl text-base"
                >
                  <bdi className="min-w-0 truncate">{state.players[line.playerId]?.name}</bdi>
                  <span className="num shrink-0 text-muted-foreground">{formatFigures(line, state.rules.ballsPerOver)}</span>
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
                  onClick={() => bowlSquadPlayer(player)}
                  className="h-12 justify-start rounded-xl text-base"
                >
                  <bdi className="truncate">{labels.get(player.id)}</bdi>
                </Button>
              ))}
            </div>
          )}
          <NameField
            name="bowler"
            label={t("bowler.name")}
            value={name}
            error={error}
            list={listId}
            onChange={(value) => {
              setName(value);
              setError(undefined);
            }}
          />
          <NameSuggestions id={listId} names={suggestNames(state, team, recent, (player) => bowled.has(player.id))} />
          <Button type="submit" disabled={busy} className="h-14 rounded-2xl text-base font-semibold">
            {t("bowler.choose")}
          </Button>
        </form>
        <DrawerFooter>{undo}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
