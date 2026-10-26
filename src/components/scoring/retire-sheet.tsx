"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/segmented-control";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import type { EventDraft, InningsState, MatchState } from "@/lib/scoring";

const REASONS = [
  { value: "hurt", label: t("dismissal.retired_hurt") },
  { value: "out", label: t("dismissal.retired_out") },
] as const;

type RetireSheetProps = {
  state: MatchState;
  innings: InningsState;
  busy: boolean;
  onClose: () => void;
  onRecord: (drafts: EventDraft[]) => Promise<boolean>;
};

export function RetireSheet({ state, innings, busy, onClose, onRecord }: RetireSheetProps) {
  const batters = [innings.striker, innings.nonStriker].filter((id) => id !== null);
  const [batter, setBatter] = useState(batters[0] ?? "");
  const [how, setHow] = useState<"hurt" | "out">("hurt");

  async function retire() {
    if (await onRecord([{ type: "retired", player: batter, how }])) onClose();
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t("menu.retire")}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
          <SegmentedControl
            label={t("wicket.batter")}
            value={batter}
            options={batters.map((id) => ({ value: id, label: state.players[id]?.name ?? id }))}
            onChange={setBatter}
          />
          <SegmentedControl label={t("retire.reason")} value={how} options={REASONS} onChange={setHow} />
        </div>
        <DrawerFooter>
          <Button disabled={busy || batter === ""} onClick={() => void retire()} className="h-14 rounded-2xl text-base font-bold">
            {t("wicket.retire")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
