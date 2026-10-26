"use client";

import { useId } from "react";
import { BallChips, commentaryById } from "@/components/match/ball-chips";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import type { InningsState, MatchState } from "@/lib/scoring";

type InningsOversProps = { state: MatchState; innings: InningsState; onSelect: (eventId: string) => void };

function InningsOvers({ state, innings, onSelect }: InningsOversProps) {
  const headingId = useId();
  const items = commentaryById(innings);
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <h3 id={headingId} className="flex border-b-2 border-primary pb-1.5 text-base font-extrabold">
        <bdi className="min-w-0 truncate">{state.teams[innings.battingTeam].name}</bdi>
      </h3>
      <ol className="flex flex-col gap-3">
        {[...innings.overs].reverse().map((over) => (
          <li key={over.index} className="flex min-w-0 flex-col gap-1.5">
            <p className="flex min-w-0 items-baseline gap-2 text-sm">
              <span className="num shrink-0 font-semibold">{t("scorecard.over", { n: over.index + 1 })}</span>
              <bdi className="min-w-0 truncate text-muted-foreground">{state.players[over.bowler]?.name ?? over.bowler}</bdi>
            </p>
            <BallChips balls={over.balls} items={items} onSelect={onSelect} />
          </li>
        ))}
      </ol>
    </section>
  );
}

type BallListSheetProps = { state: MatchState; onClose: () => void; onSelect: (eventId: string) => void };

export function BallListSheet({ state, onClose, onSelect }: BallListSheetProps) {
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t("menu.editBall")}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-safe">
          {[...state.innings].reverse().map((innings) => (
            <InningsOvers key={innings.number} state={state} innings={innings} onSelect={onSelect} />
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
