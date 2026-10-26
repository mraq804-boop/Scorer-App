import { BallChips, commentaryById } from "@/components/match/ball-chips";
import { t } from "@/lib/i18n";
import type { InningsState } from "@/lib/scoring";

type ThisOverProps = {
  innings: InningsState;
  ballsPerOver: number;
  onSelect?: (eventId: string) => void;
};

export function ThisOver({ innings, ballsPerOver, onSelect }: ThisOverProps) {
  const over = innings.overs.at(-1);
  const finished = over !== undefined && over.index < Math.floor(innings.legalBalls / ballsPerOver);
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {finished ? t("score.lastOver") : t("score.thisOver")}
      </h2>
      <BallChips testId="this-over" balls={over?.balls ?? []} items={commentaryById(innings)} onSelect={onSelect} />
    </section>
  );
}
