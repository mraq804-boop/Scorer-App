"use client";

import { ChevronLeft } from "lucide-react";
import { useId, useState } from "react";
import { WITH_FIELDER } from "@/components/scoring/ball-patch";
import { NameField, NameSuggestions } from "@/components/scoring/name-field";
import { fielderOptions, suggestNames, xiFor } from "@/components/scoring/player-drafts";
import type { MatchTeam } from "@/components/scoring/player-drafts";
import { XiSelect, squadLabels } from "@/components/scoring/team-xi-picker";
import { SegmentedControl } from "@/components/segmented-control";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { t } from "@/lib/i18n";
import { availableDismissals } from "@/lib/scoring";
import type { AvailableDismissal, BallKind, DismissalKind, InningsState, MatchState } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { nameSchema } from "@/lib/validation/match-setup";

export type WicketBall = {
  runs: number;
  wicket: { kind: DismissalKind; playerOut?: string; fielderName: string | null; fielderId?: string };
};

const WHICH_BATTER: ReadonlySet<AvailableDismissal> = new Set(["run_out", "retired_hurt", "retired_out"]);
const RUNS_COMPLETED = [0, 1, 2, 3].map((runs) => ({ value: runs, label: String(runs) }));

function isRetirement(dismissal: AvailableDismissal): dismissal is "retired_hurt" | "retired_out" {
  return dismissal === "retired_hurt" || dismissal === "retired_out";
}

function needsDetails(dismissal: AvailableDismissal): boolean {
  return WITH_FIELDER.has(dismissal) || WHICH_BATTER.has(dismissal);
}

type WicketSheetProps = {
  state: MatchState;
  innings: InningsState;
  matchTeam?: MatchTeam;
  kind: BallKind;
  busy: boolean;
  onClose: () => void;
  onBall: (ball: WicketBall) => Promise<boolean>;
  onRetire: (player: string, how: "hurt" | "out") => Promise<boolean>;
};

export function WicketSheet({ state, innings, matchTeam, kind, busy, onClose, onBall, onRetire }: WicketSheetProps) {
  const batters = [innings.striker, innings.nonStriker].filter((id) => id !== null);
  const [dismissal, setDismissal] = useState<AvailableDismissal | null>(null);
  const [batter, setBatter] = useState(batters[0] ?? "");
  const [runs, setRuns] = useState(0);
  const [fielder, setFielder] = useState("");
  const [squadFielder, setSquadFielder] = useState("");
  const [fielderError, setFielderError] = useState<string>();
  const fieldersId = useId();
  const squad = fielderOptions(xiFor(matchTeam, innings.bowlingTeam), state, innings.bowler);
  const labels = squadLabels(squad);

  async function confirm(chosen: AvailableDismissal) {
    let fielderName: string | null = null;
    let fielderId: string | undefined;
    if (WITH_FIELDER.has(chosen) && squad.length > 0) {
      const picked = squad.find((player) => player.id === squadFielder);
      fielderName = picked?.name ?? null;
      fielderId = picked?.id;
    } else if (WITH_FIELDER.has(chosen) && fielder.trim() !== "") {
      const parsed = nameSchema.safeParse(fielder);
      if (!parsed.success) {
        setFielderError(parsed.error.issues[0]?.message);
        return;
      }
      fielderName = parsed.data;
    }
    const saved = isRetirement(chosen)
      ? await onRetire(batter, chosen === "retired_hurt" ? "hurt" : "out")
      : await onBall({
          runs: chosen === "run_out" ? runs : 0,
          wicket: {
            kind: chosen,
            playerOut: chosen === "run_out" ? batter : undefined,
            fielderName,
            ...(fielderId === undefined ? {} : { fielderId }),
          },
        });
    if (saved) onClose();
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t("wicket.title")}</DrawerTitle>
        </DrawerHeader>
        {dismissal === null ? (
          <div className="grid grid-cols-2 gap-2 overflow-y-auto px-4 pb-4">
            {availableDismissals(state, kind).map((option) => (
              <Button
                key={option}
                variant="outline"
                disabled={busy}
                onClick={() => (needsDetails(option) ? setDismissal(option) : void confirm(option))}
                className="h-14 rounded-xl text-base font-semibold"
              >
                {t(`dismissal.${option}`)}
              </Button>
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 overflow-y-auto px-4">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  aria-label={t("common.back")}
                  onClick={() => setDismissal(null)}
                  className="-ms-2 size-11 rounded-full"
                >
                  <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
                </Button>
                <h3 className="text-lg font-bold">{t(`dismissal.${dismissal}`)}</h3>
              </div>
              {WHICH_BATTER.has(dismissal) && (
                <SegmentedControl
                  label={t("wicket.batter")}
                  value={batter}
                  options={batters.map((id) => ({ value: id, label: state.players[id]?.name ?? id }))}
                  onChange={setBatter}
                />
              )}
              {dismissal === "run_out" && (
                <SegmentedControl label={t("wicket.runs")} value={runs} options={RUNS_COMPLETED} onChange={setRuns} />
              )}
              {WITH_FIELDER.has(dismissal) &&
                (squad.length > 0 ? (
                  <XiSelect
                    name="fielder"
                    label={t("wicket.fielder")}
                    value={squadFielder}
                    players={squad}
                    labels={labels}
                    empty={t("wicket.noFielder")}
                    onChange={setSquadFielder}
                  />
                ) : (
                  <>
                    <NameField
                      name="fielder"
                      label={t("wicket.fielder")}
                      value={fielder}
                      error={fielderError}
                      list={fieldersId}
                      onChange={(value) => {
                        setFielder(value);
                        setFielderError(undefined);
                      }}
                    />
                    <NameSuggestions id={fieldersId} names={suggestNames(state, innings.bowlingTeam, [])} />
                  </>
                ))}
            </div>
            <DrawerFooter>
              <Button
                disabled={busy || batter === ""}
                onClick={() => void confirm(dismissal)}
                className={cn(
                  "h-14 rounded-2xl text-base font-bold",
                  !isRetirement(dismissal) && "bg-destructive text-white hover:bg-destructive/90",
                )}
              >
                {isRetirement(dismissal) ? t("wicket.retire") : t("wicket.out")}
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
