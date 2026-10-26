"use client";

import { ArrowLeftRight, ClipboardList, EllipsisVertical, Flag, LogOut, Pencil, Repeat, Share2, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { BallListSheet } from "@/components/scoring/ball-list-sheet";
import { BowlerSheet } from "@/components/scoring/bowler-sheet";
import { RetireSheet } from "@/components/scoring/retire-sheet";
import { SettingsSheet } from "@/components/scoring/settings-sheet";
import { Scorecard } from "@/components/scorecard/scorecard";
import { ShareButtons } from "@/components/share/share-buttons";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import { getLocalDb } from "@/lib/local/db";
import type { LocalMatch } from "@/lib/local/db";
import { currentInnings } from "@/lib/scoring";
import type { EventDraft, InningsState, MatchState } from "@/lib/scoring";
import { flushSync } from "@/lib/sync/flush";

type Panel = "menu" | "bowler" | "retire" | "balls" | "settings" | "end" | "scorecard" | "share";
type OnRecord = (drafts: EventDraft[]) => Promise<boolean>;

type MatchMenuProps = {
  local: Pick<LocalMatch, "id" | "code" | "syncedSeq">;
  state: MatchState;
  blocked: boolean;
  busy: boolean;
  recent: readonly string[];
  onRecord: OnRecord;
  onEditBall: (eventId: string) => void;
};

type MenuItemProps = {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

function MenuItem({ icon: Icon, label, disabled, onClick }: MenuItemProps) {
  return (
    <Button
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className="h-14 w-full justify-start gap-3 rounded-xl px-3 text-base font-semibold"
    >
      <Icon className="size-5 text-muted-foreground" aria-hidden />
      {label}
    </Button>
  );
}

function EndInningsDialog({
  innings,
  busy,
  onClose,
  onRecord,
}: {
  innings: InningsState;
  busy: boolean;
  onClose: () => void;
  onRecord: OnRecord;
}) {
  const end = async () => {
    if (await onRecord([{ type: "innings_ended", innings: innings.number, reason: "manual" }])) onClose();
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent aria-describedby={undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold">{t("endInnings.title")}</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            disabled={busy}
            onClick={() => void end()}
            className="h-12 rounded-xl bg-destructive text-base font-semibold text-white hover:bg-destructive/90"
          >
            {t("score.endInnings")}
          </Button>
          <AlertDialogCancel className="h-12 rounded-xl text-base font-semibold">{t("common.cancel")}</AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ScorecardSheet({ state, onClose }: { state: MatchState; onClose: () => void }) {
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent
        aria-describedby={undefined}
        className="mx-auto max-w-md data-[vaul-drawer-direction=bottom]:max-h-[92dvh]"
      >
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t("scorecard.title")}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-safe">
          <Scorecard state={state} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ShareSheet({ local, state, onClose }: { local: MatchMenuProps["local"]; state: MatchState; onClose: () => void }) {
  const [flushed] = useState(() => flushSync(getLocalDb(), local.id).then(() => undefined));
  const beforeShare = useCallback(() => flushed, [flushed]);
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t("share.sheetTitle")}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-safe">
          <ShareButtons code={local.code} state={state} beforeShare={beforeShare} eager />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function MatchMenu({ local, state, blocked, busy, recent, onRecord, onEditBall }: MatchMenuProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const live = currentInnings(state);
  const locked = blocked || busy || live === null;
  const bowled = state.innings.some((innings) => innings.overs.length > 0);
  const shareable = local.syncedSeq > 0;
  const close = () => setPanel(null);

  const recordAndClose: OnRecord = async (drafts) => {
    const saved = await onRecord(drafts);
    if (saved) close();
    return saved;
  };

  return (
    <>
      <Button
        variant="ghost"
        aria-label={t("menu.title")}
        onClick={() => setPanel("menu")}
        className="-me-2 size-11 shrink-0 rounded-full"
      >
        <EllipsisVertical className="size-6" aria-hidden />
      </Button>

      {panel === "menu" && (
        <Drawer open onOpenChange={(open) => !open && close()}>
          <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
            <DrawerHeader>
              <DrawerTitle className="text-xl font-bold">{t("menu.title")}</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-1 overflow-y-auto px-3 pb-safe">
              <MenuItem
                icon={ArrowLeftRight}
                label={t("menu.swapStrike")}
                disabled={locked}
                onClick={() => void recordAndClose([{ type: "strike_swapped" }])}
              />
              <MenuItem icon={Repeat} label={t("menu.changeBowler")} disabled={locked} onClick={() => setPanel("bowler")} />
              <MenuItem icon={LogOut} label={t("menu.retire")} disabled={locked} onClick={() => setPanel("retire")} />
              <MenuItem
                icon={Pencil}
                label={t("menu.editBall")}
                disabled={blocked || busy || !bowled}
                onClick={() => setPanel("balls")}
              />
              <MenuItem icon={SlidersHorizontal} label={t("menu.settings")} disabled={locked} onClick={() => setPanel("settings")} />
              <MenuItem icon={Flag} label={t("score.endInnings")} disabled={locked} onClick={() => setPanel("end")} />
              <MenuItem icon={ClipboardList} label={t("scorecard.title")} onClick={() => setPanel("scorecard")} />
              <MenuItem icon={Share2} label={t("menu.share")} disabled={!shareable} onClick={() => setPanel("share")} />
              {!shareable && <p className="px-3 pb-2 text-sm text-muted-foreground">{t("share.waitForSync")}</p>}
            </div>
          </DrawerContent>
        </Drawer>
      )}
      {panel === "bowler" && live !== null && (
        <BowlerSheet
          state={state}
          innings={live}
          recent={recent}
          busy={busy}
          title={t("menu.changeBowler")}
          onClose={close}
          onRecord={recordAndClose}
        />
      )}
      {panel === "retire" && live !== null && (
        <RetireSheet state={state} innings={live} busy={busy} onClose={close} onRecord={onRecord} />
      )}
      {panel === "balls" && !blocked && (
        <BallListSheet
          state={state}
          onClose={close}
          onSelect={(eventId) => {
            close();
            onEditBall(eventId);
          }}
        />
      )}
      {panel === "settings" && live !== null && (
        <SettingsSheet state={state} innings={live} busy={busy} onClose={close} onRecord={onRecord} />
      )}
      {panel === "end" && live !== null && (
        <EndInningsDialog innings={live} busy={busy} onClose={close} onRecord={onRecord} />
      )}
      {panel === "scorecard" && <ScorecardSheet state={state} onClose={close} />}
      {panel === "share" && shareable && <ShareSheet local={local} state={state} onClose={close} />}
    </>
  );
}
