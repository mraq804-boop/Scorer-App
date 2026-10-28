"use client";

import { useState } from "react";
import { browserEffectsEnabled } from "@/components/effects/motion";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import type { CommentaryItem } from "@/lib/scoring";
import { burstFor } from "./burst";
import type { Burst } from "./burst";

const LABELS: Record<Burst, MessageKey> = { four: "burst.four", six: "burst.six", wicket: "burst.wicket" };

type Tracked = { latest: string | undefined; previous: CommentaryItem | undefined; seen: ReadonlySet<string>; shown: { kind: Burst; id: string } | null };

export function BallBurst({ commentary }: { commentary: readonly CommentaryItem[] }) {
  const latest = commentary.at(-1);
  const [tracked, setTracked] = useState<Tracked>(() => ({
    latest: latest?.eventId,
    previous: latest,
    seen: new Set(commentary.map((item) => item.eventId)),
    shown: null,
  }));

  if (tracked.latest !== latest?.eventId) {
    const fresh = latest !== undefined && !tracked.seen.has(latest.eventId);
    const kind = fresh ? burstFor(tracked.previous, latest) : null;
    setTracked({
      latest: latest?.eventId,
      previous: latest,
      seen: new Set([...tracked.seen, ...commentary.map((item) => item.eventId)]),
      shown: kind !== null && latest !== undefined && browserEffectsEnabled() ? { kind, id: latest.eventId } : tracked.shown,
    });
  }

  if (tracked.shown === null) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      <span
        key={tracked.shown.id}
        data-testid="ball-burst"
        className={
          tracked.shown.kind === "wicket"
            ? "ball-burst rounded-2xl bg-destructive px-6 py-2 text-4xl font-black tracking-wide text-white shadow-lg"
            : "ball-burst rounded-2xl bg-haldi px-6 py-2 text-5xl font-black tracking-wide text-black shadow-lg"
        }
      >
        {t(LABELS[tracked.shown.kind])}
      </span>
    </div>
  );
}
