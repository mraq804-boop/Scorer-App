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

export function ThisOver({ innings, ballsPerOver }: { innings: InningsState; ballsPerOver: number }) {
  const over = innings.overs.at(-1);
  const finished = over !== undefined && over.index < Math.floor(innings.legalBalls / ballsPerOver);
  const items = new Map(innings.commentary.map((item) => [item.eventId, item]));
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {finished ? t("score.lastOver") : t("score.thisOver")}
      </h2>
      <ol data-testid="this-over" className="flex min-h-10 flex-wrap gap-1.5">
        {over?.balls.map((chip) => (
          <li
            key={chip.eventId}
            className={cn(
              "num grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm font-bold",
              TONES[toneOf(items.get(chip.eventId))],
            )}
          >
            {chip.label}
          </li>
        ))}
      </ol>
    </section>
  );
}
