import { t } from "@/lib/i18n";
import type { CommentaryItem, InningsState } from "@/lib/scoring";
import { cn } from "@/lib/utils";

type Tone = "wicket" | "boundary" | "extra" | "plain";

const TONES: Record<Tone, string> = {
  wicket: "bg-destructive text-white",
  boundary: "bg-primary text-primary-foreground",
  extra: "bg-accent text-accent-foreground",
  plain: "bg-muted text-foreground",
};

function toneOf(item: CommentaryItem | undefined): Tone {
  if (item === undefined) return "plain";
  if (item.wicket !== null) return "wicket";
  if (item.kind !== "legal" || (item.runsAs !== "bat" && item.runs > 0)) return "extra";
  if (item.boundary && (item.runs === 4 || item.runs === 6)) return "boundary";
  return "plain";
}

type ThisOverProps = {
  innings: InningsState;
  ballsPerOver: number;
  onSelect?: (eventId: string) => void;
};

const CHIP = "num grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm font-bold";

export function ThisOver({ innings, ballsPerOver, onSelect }: ThisOverProps) {
  const over = innings.overs.at(-1);
  const finished = over !== undefined && over.index < Math.floor(innings.legalBalls / ballsPerOver);
  const items = new Map(innings.commentary.map((item) => [item.eventId, item]));
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {finished ? t("score.lastOver") : t("score.thisOver")}
      </h2>
      <ol data-testid="this-over" className="flex min-h-10 flex-wrap gap-1.5">
        {over?.balls.map((chip) => {
          const item = items.get(chip.eventId);
          const tone = cn(CHIP, TONES[toneOf(item)]);
          return (
            <li key={chip.eventId}>
              {onSelect === undefined || item === undefined ? (
                <span className={tone}>{chip.label}</span>
              ) : (
                <button
                  type="button"
                  aria-label={t("edit.chip", { ball: item.ballLabel, label: chip.label })}
                  onClick={() => onSelect(chip.eventId)}
                  className={cn(tone, "outline-none focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95")}
                >
                  {chip.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
