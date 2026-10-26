"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { takeOverScoring } from "@/lib/identity/takeover";
import { getLocalDb } from "@/lib/local/db";

type TakeOverDialogProps = {
  client: SupabaseClient;
  match: { id: string; title: string };
  onClose: () => void;
};

export function TakeOverDialog({ client, match, onClose }: TakeOverDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await takeOverScoring(client, getLocalDb(), match.id);
    } catch {
      setFailed(true);
      setBusy(false);
      return;
    }
    window.location.assign(`/score?m=${match.id}`);
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold">{t("account.takeOver.title")}</AlertDialogTitle>
          <p className="min-w-0 max-w-full truncate font-semibold">
            <bdi>{match.title}</bdi>
          </p>
          <AlertDialogDescription>{t("account.takeOver.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-destructive">
            {t("account.takeOver.failed")}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button disabled={busy} onClick={() => void confirm()} className="h-12 rounded-xl text-base font-semibold">
            {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
            {t("account.takeOver")}
          </Button>
          <AlertDialogCancel disabled={busy} className="h-12 rounded-xl text-base font-semibold">
            {t("common.cancel")}
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
