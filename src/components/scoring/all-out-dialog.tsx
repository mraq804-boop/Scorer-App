"use client";

import type { ReactNode } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { EventDraft, InningsState, MatchState, TeamSide } from "@/lib/scoring";

type AllOutDialogProps = {
  state: MatchState;
  innings: InningsState;
  busy: boolean;
  undo: ReactNode;
  onRecord: (drafts: EventDraft[]) => Promise<boolean>;
};

function onePlayerMore(state: MatchState, team: TeamSide): EventDraft {
  const players = state.rules.playersPerSide[team] + 1;
  return { type: "settings_changed", playersPerSide: team === "A" ? { A: players } : { B: players } };
}

export function AllOutDialog({ state, innings, busy, undo, onRecord }: AllOutDialogProps) {
  return (
    <AlertDialog open>
      <AlertDialogContent aria-describedby={undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold">{t("prompt.allOut")}</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            disabled={busy}
            onClick={() => void onRecord([{ type: "innings_ended", innings: innings.number, reason: "all_out" }])}
            className="h-12 rounded-xl text-base font-semibold"
          >
            {t("score.endInnings")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void onRecord([onePlayerMore(state, innings.battingTeam)])}
            className="h-12 rounded-xl text-base font-semibold"
          >
            {t("prompt.addPlayer")}
          </Button>
          {undo}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
