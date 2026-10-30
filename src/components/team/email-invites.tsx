"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/team-page/avatar";
import { Button } from "@/components/ui/button";
import { safeLocalStorage } from "@/lib/app/frame";
import { colourFor, logoUrl } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { acceptEmailInvite, fetchEmailInvites } from "@/lib/team/remote";
import type { EmailInvite, TeamError } from "@/lib/team/remote";
import { FormAlert, teamErrorMessage } from "./form";

const DISMISSED_KEY = "cricket-scorer:dismissed-invites";

function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(safeLocalStorage()?.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((code): code is string => typeof code === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(codes: string[]): void {
  try {
    safeLocalStorage()?.setItem(DISMISSED_KEY, JSON.stringify(codes));
  } catch {
    return;
  }
}

function joinError(error: TeamError): string {
  if (error === "invite_invalid") return t("team.invites.gone");
  if (error === "quota_exceeded") return t("team.invites.full");
  return teamErrorMessage(error);
}

type InviteCardProps = { client: SupabaseClient; invite: EmailInvite; onJoined: () => Promise<void>; onDismiss: () => void };

function InviteCard({ client, invite, onJoined, onDismiss }: InviteCardProps) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const join = async () => {
    setBusy(true);
    setError(undefined);
    const result = await acceptEmailInvite(client, invite.code);
    if (!result.ok) {
      setError(joinError(result.error));
      setBusy(false);
      return;
    }
    toast.success(t("team.invites.joined", { team: invite.name }));
    await onJoined();
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-2xl border-2 border-haldi bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar
          name={invite.name}
          url={logoUrl(invite.code, invite.logoVersion ?? undefined)}
          size={48}
          colour={colourFor(invite.colour ?? undefined, invite.name)}
          alt=""
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={titleId} className="font-bold">
            {t("team.invites.title", { team: invite.name })}
          </h2>
          <p className="text-sm text-muted-foreground">{t("team.invites.body")}</p>
        </div>
      </div>
      {error !== undefined && <FormAlert message={error} />}
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onDismiss} className="h-12 flex-1 rounded-xl text-base">
          {t("team.invites.dismiss")}
        </Button>
        <Button type="button" disabled={busy} onClick={() => void join()} className="h-12 flex-1 rounded-xl text-base font-semibold">
          {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
          {t("team.invites.join")}
        </Button>
      </div>
    </section>
  );
}

export function EmailInvites({ client, onJoined }: { client: SupabaseClient; onJoined: () => Promise<void> }) {
  const [invites, setInvites] = useState<EmailInvite[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  useEffect(() => {
    let active = true;
    void fetchEmailInvites(client).then((result) => {
      if (active && result.ok) setInvites(result.value);
    });
    return () => {
      active = false;
    };
  }, [client]);

  const dismiss = (code: string) => {
    const next = [...dismissed, code];
    setDismissed(next);
    writeDismissed(next);
  };

  const joined = async (code: string) => {
    setInvites((current) => current.filter((invite) => invite.code !== code));
    await onJoined();
  };

  return invites
    .filter((invite) => !dismissed.includes(invite.code))
    .map((invite) => (
      <InviteCard
        key={invite.code}
        client={client}
        invite={invite}
        onJoined={() => joined(invite.code)}
        onDismiss={() => dismiss(invite.code)}
      />
    ));
}
