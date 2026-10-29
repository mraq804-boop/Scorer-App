"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, UserPlus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { CachedTeam } from "@/lib/local/db";
import { inviteUrl } from "@/lib/site-url";
import { createScorerInvite, fetchScorers, removeScorer } from "@/lib/team/remote";
import type { Scorer } from "@/lib/team/remote";
import { ConfirmDialog } from "./confirm-dialog";
import { FormAlert, teamErrorMessage } from "./form";
import { ShareLink } from "./share-link";

type ScorersEditorProps = { client: SupabaseClient; team: CachedTeam };

type Load = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; scorers: Scorer[] };

const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

function scorerName(scorer: Scorer): string {
  return scorer.name ?? t("team.scorers.unnamed");
}

type RemoveDialogProps = {
  client: SupabaseClient;
  scorer: Scorer;
  onRemoved: () => Promise<void>;
  onClose: () => void;
  fallbackFocus: () => void;
};

function RemoveDialog({ client, scorer, onRemoved, onClose, fallbackFocus }: RemoveDialogProps) {
  return (
    <ConfirmDialog
      title={t("team.scorers.removeTitle", { name: scorerName(scorer) })}
      body={t("team.scorers.removeBody")}
      confirmLabel={t("team.scorers.remove")}
      onConfirm={() => removeScorer(client, scorer.userId)}
      onDone={onRemoved}
      onClose={onClose}
      fallbackFocus={fallbackFocus}
    />
  );
}

export function ScorersEditor({ client, team }: ScorersEditorProps) {
  const headingId = useId();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | undefined>(undefined);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Scorer | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    void fetchScorers(client).then((result) => {
      if (active) setLoad(result.ok ? { kind: "ready", scorers: result.value } : { kind: "failed" });
    });
    return () => {
      active = false;
    };
  }, [client]);

  const reload = async () => {
    const result = await fetchScorers(client);
    setLoad(result.ok ? { kind: "ready", scorers: result.value } : { kind: "failed" });
  };

  const createInvite = async () => {
    setInviting(true);
    setInviteError(undefined);
    try {
      const result = await createScorerInvite(client);
      if (result.ok) setInvite(inviteUrl(result.value));
      else setInviteError(teamErrorMessage(result.error, t("team.error.scorersFull")));
    } finally {
      setInviting(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-lg font-bold outline-none">
          {t("team.scorers.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("team.scorers.body")}</p>
      </div>
      {load.kind === "loading" && <p className="text-sm text-muted-foreground">{t("team.loading")}</p>}
      {load.kind === "failed" && <FormAlert message={t("team.scorers.loadFailed")} />}
      {load.kind === "ready" && load.scorers.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("team.scorers.empty")}</p>
      )}
      {load.kind === "ready" && load.scorers.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {load.scorers.map((scorer) => {
            const date = dayFormat.format(new Date(scorer.addedAt));
            const name = scorerName(scorer);
            return (
              <li key={scorer.userId} className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3.5 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <bdi className="truncate font-medium">{name}</bdi>
                  <span className="num text-sm text-muted-foreground">{t("team.scorers.added", { date })}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={t("team.scorers.removeLabel", { name, date })}
                  onClick={() => setRemoving(scorer)}
                  className="h-11 rounded-xl px-4 text-base"
                >
                  {t("team.scorers.remove")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {invite === null ? (
        <Button
          type="button"
          variant="outline"
          disabled={inviting}
          onClick={() => void createInvite()}
          className="h-12 rounded-xl text-base"
        >
          {inviting ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <UserPlus className="size-5" aria-hidden />}
          {t("team.scorers.invite")}
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed p-3">
          <ShareLink url={invite} text={t("team.scorers.shareText", { name: team.name, url: invite })} testId="invite-link" />
          <p className="text-sm text-muted-foreground">{t("team.scorers.inviteHint")}</p>
        </div>
      )}
      {inviteError !== undefined && <FormAlert message={inviteError} />}
      {removing !== null && (
        <RemoveDialog
          client={client}
          scorer={removing}
          onRemoved={reload}
          onClose={() => setRemoving(null)}
          fallbackFocus={() => headingRef.current?.focus()}
        />
      )}
    </section>
  );
}
