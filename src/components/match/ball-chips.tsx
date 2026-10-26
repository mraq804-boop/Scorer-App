import { t } from "@/lib/i18n";
import type { BallChip, CommentaryItem, InningsState } from "@/lib/scoring";
import { cn } from "@/lib/utils";

type Tone = "wicket" | "boundary" | "extra" | "plain";

const TONES: Record<Tone, string> = {
  wicket: "bg-destructive text-white",
  boundary: "bg-primary text-primary-foreground",
  extra: "bg-accent text-accent-foreground",
  plain: "bg-muted text-foreground",
};

const CHIP = "num grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm font-bold";

function toneOf(item: CommentaryItem | undefined): Tone {
  if (item === undefined) return "plain";
  if (item.wicket !== null) return "wicket";
  if (item.kind !== "legal" || (item.runsAs !== "bat" && item.runs > 0)) return "extra";
  if (item.boundary && (item.runs === 4 || item.runs === 6)) return "boundary";
  return "plain";
}

export function commentaryById(innings: InningsState): Map<string, CommentaryItem> {
  return new Map(innings.commentary.map((item) => [item.eventId, item]));
}

type BallChipsProps = {
  balls: readonly BallChip[];
  items: ReadonlyMap<string, CommentaryItem>;
  testId?: string;
  onSelect?: (eventId: string) => void;
};

export function BallChips({ balls, items, testId, onSelect }: BallChipsProps) {
  return (
    <ol data-testid={testId} className="flex min-h-10 flex-wrap gap-1.5">
      {balls.map((chip) => {
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
  );
}
