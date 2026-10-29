"use client";

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
import type { TeamResult } from "@/lib/team/remote";
import { FormAlert, teamErrorMessage } from "./form";

type ConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<TeamResult<void>>;
  onDone: () => Promise<void>;
  onClose: () => void;
  fallbackFocus?: () => void;
};

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onDone, onClose, fallbackFocus }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener?.isConnected) opener.focus();
    else fallbackFocus?.();
  };

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    const result = await onConfirm();
    if (!result.ok) {
      setError(teamErrorMessage(result.error));
      setBusy(false);
      return;
    }
    await onDone();
    onClose();
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent onCloseAutoFocus={restoreFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="min-w-0 truncate text-lg font-bold">
            <bdi>{title}</bdi>
          </AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        {error !== undefined && <FormAlert message={error} />}
        <div className="flex flex-col gap-2">
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
            className="h-12 rounded-xl text-base font-semibold"
          >
            {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
          <AlertDialogCancel disabled={busy} className="h-12 rounded-xl text-base font-semibold">
            {t("common.cancel")}
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
