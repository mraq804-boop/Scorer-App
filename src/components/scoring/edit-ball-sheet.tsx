"use client";

import { useId, useState } from "react";
import {
  WITH_FIELDER,
  buildPatch,
  fieldsOf,
  isBoundaryRuns,
  isUnchanged,
  setKind,
  setRuns,
  wicketOptions,
} from "@/components/scoring/ball-patch";
import type { EditableBall } from "@/components/scoring/ball-patch";
import { NameField, NameSuggestions } from "@/components/scoring/name-field";
import { suggestNames } from "@/components/scoring/player-drafts";
import { ToggleRow } from "@/components/scoring/rules-fields";
import { SegmentedControl } from "@/components/segmented-control";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import { canCorrect } from "@/lib/scoring";
import type { CorrectionPatch, MatchState } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { nameSchema } from "@/lib/validation/match-setup";

const KINDS = [
  { value: "legal", label: t("edit.kind.legal") },
  { value: "wide", label: t("score.extra.wide") },
  { value: "noball", label: t("score.extra.noBall") },
] as const;

const RUNS_AS = [
  { value: "bat", label: t("edit.runsAs.bat") },
  { value: "bye", label: t("score.extra.bye") },
  { value: "legbye", label: t("score.extra.legBye") },
] as const;

const RUNS = [0, 1, 2, 3, 4, 5, 6, 7].map((runs) => ({ value: runs, label: String(runs) }));

type EditBallSheetProps = {
  state: MatchState;
  ball: EditableBall;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: CorrectionPatch) => Promise<boolean>;
};

export function EditBallSheet({ state, ball, busy, onClose, onSave }: EditBallSheetProps) {
  const [fields, setFields] = useState(() => fieldsOf(ball.item));
  const [fielderError, setFielderError] = useState<string>();
  const wicketId = useId();
  const fieldersId = useId();

  const hasWicket = ball.event.wicket !== null;
  const options = hasWicket ? wicketOptions(state, ball, fields.kind) : [];
  const wicketKind = fields.wicketKind;
  const wicketFits = !hasWicket || (wicketKind !== null && options.includes(wicketKind));
  const patch = buildPatch(fields, state.rules);
  const canSave = !busy && wicketFits && canCorrect(ball.event, patch) && !isUnchanged(patch, ball.item);
  const asksFielder = wicketKind !== null && WITH_FIELDER.has(wicketKind);

  async function save() {
    if (asksFielder && fields.fielder.trim() !== "") {
      const parsed = nameSchema.safeParse(fields.fielder);
      if (!parsed.success) {
        setFielderError(parsed.error.issues[0]?.message);
        return;
      }
    }
    if (await onSave(patch)) onClose();
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t("edit.title", { ball: ball.item.ballLabel })}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
          <SegmentedControl
            label={t("edit.kind")}
            value={fields.kind}
            options={KINDS}
            onChange={(kind) => setFields((current) => setKind(current, kind))}
          />
          <SegmentedControl
            label={t("score.runs")}
            value={fields.runs}
            options={RUNS}
            onChange={(runs) => setFields((current) => setRuns(current, runs))}
          />
          {fields.kind !== "wide" && (
            <SegmentedControl
              label={t("edit.runsAs")}
              value={fields.runsAs}
              options={RUNS_AS}
              onChange={(runsAs) => setFields((current) => ({ ...current, runsAs }))}
            />
          )}
          {isBoundaryRuns(fields.runs) && (
            <ToggleRow
              label={t("edit.boundary")}
              checked={fields.boundary}
              onChange={(boundary) => setFields((current) => ({ ...current, boundary }))}
            />
          )}
          {hasWicket && (
            <div role="group" aria-labelledby={wicketId} className="flex flex-col gap-2">
              <span id={wicketId} className="text-sm font-medium">
                {t("wicket.title")}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {options.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant="outline"
                    aria-pressed={wicketKind === option}
                    onClick={() => setFields((current) => ({ ...current, wicketKind: option }))}
                    className={cn(
                      "h-12 rounded-xl text-base font-semibold",
                      wicketKind === option && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {t(`dismissal.${option}`)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {asksFielder && (
            <>
              <NameField
                name="fielder"
                label={t("wicket.fielder")}
                value={fields.fielder}
                error={fielderError}
                list={fieldersId}
                onChange={(fielder) => {
                  setFields((current) => ({ ...current, fielder }));
                  setFielderError(undefined);
                }}
              />
              <NameSuggestions id={fieldersId} names={suggestNames(state, ball.innings.bowlingTeam, [])} />
            </>
          )}
        </div>
        <DrawerFooter>
          <Button disabled={!canSave} onClick={() => void save()} className="h-14 rounded-2xl text-base font-bold">
            {t("common.save")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
