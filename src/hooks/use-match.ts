"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { blockedMessage } from "@/components/sync-chip";
import { t } from "@/lib/i18n";
import { formatWarning } from "@/lib/i18n/cricket";
import { getLocalDb } from "@/lib/local/db";
import type { LocalDb, LocalMatch } from "@/lib/local/db";
import { appendEvents, loadEvents } from "@/lib/local/matches";
import { nextPrompt, replay } from "@/lib/scoring";
import type { EventDraft, MatchEvent, MatchState, Prompt, Warning } from "@/lib/scoring";
import { requestSync } from "@/lib/sync/sync";

export type UseMatch = {
  local: LocalMatch | undefined;
  events: MatchEvent[];
  state: MatchState | null;
  prompt: Prompt | null;
  record(drafts: EventDraft[]): Promise<boolean>;
  loaded: boolean;
  busy: boolean;
  wroteLast: boolean;
};

const NO_EVENTS: MatchEvent[] = [];

function warningKey(warning: Warning): string {
  return JSON.stringify(warning);
}

function warnAbout(db: LocalDb, matchId: string, appended: readonly MatchEvent[]): void {
  const ids = new Set(appended.map((event) => event.id));
  void loadEvents(db, matchId)
    .then((events) => {
      const state = replay(events);
      const before = new Set(replay(events.filter((event) => !ids.has(event.id))).warnings.map(warningKey));
      for (const warning of state.warnings) {
        if (!before.has(warningKey(warning))) toast.warning(formatWarning(warning, state.players));
      }
    })
    .catch(() => undefined);
}

export function useMatch(matchId: string): UseMatch {
  const match = useLiveQuery(async () => (await getLocalDb().matches.get(matchId)) ?? null, [matchId]);
  const stored = useLiveQuery(() => loadEvents(getLocalDb(), matchId), [matchId]);
  const events = stored ?? NO_EVENTS;
  const state = useMemo(() => (events.length === 0 ? null : replay(events)), [events]);
  const prompt = useMemo(() => (state === null ? null : nextPrompt(state)), [state]);

  const writing = useRef(false);
  const [saving, setSaving] = useState(false);
  const [ownSeq, setOwnSeq] = useState(0);
  const lastSeq = events.at(-1)?.seq ?? 0;

  const record = useCallback(
    async (drafts: EventDraft[]): Promise<boolean> => {
      if (writing.current) return false;
      writing.current = true;
      setSaving(true);
      const db = getLocalDb();
      let appended: MatchEvent[];
      try {
        const current = await db.matches.get(matchId);
        if (current?.syncState === "blocked") {
          toast.error(blockedMessage(current.blockedReason));
          return false;
        }
        appended = await appendEvents(db, matchId, drafts);
      } catch {
        toast.error(t("score.saveFailed"));
        return false;
      } finally {
        writing.current = false;
        setSaving(false);
      }
      setOwnSeq(appended.at(-1)?.seq ?? 0);
      requestSync();
      warnAbout(db, matchId, appended);
      return true;
    },
    [matchId],
  );

  return {
    local: match ?? undefined,
    events,
    state,
    prompt,
    record,
    loaded: match !== undefined && stored !== undefined,
    busy: saving || lastSeq < ownSeq,
    wroteLast: ownSeq > 0 && lastSeq === ownSeq,
  };
}
