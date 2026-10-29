"use client";

import { Ellipsis, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/team/form";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { onlineCopy } from "@/lib/app/home";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import { getLocalDb } from "@/lib/local/db";
import type { LocalMatch } from "@/lib/local/db";
import { removeLocalMatch } from "@/lib/local/matches";

const WARNINGS: Record<ReturnType<typeof onlineCopy>, MessageKey> = {
  none: "home.delete.none",
  partial: "home.delete.partial",
  full: "home.delete.full",
};

export function MatchActions({ match }: { match: LocalMatch }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const copy = onlineCopy(match);

  const show = () => {
    setFailed(false);
    setOpen(true);
  };

  const remove = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await removeLocalMatch(getLocalDb(), match.code);
      toast.success(t("home.deleted"));
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
    else document.querySelector<HTMLElement>("h1")?.focus();
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={show}
        aria-label={t("home.more", { title: match.title })}
        className="press absolute end-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Ellipsis className="size-5" aria-hidden />
      </button>
      <Drawer open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DrawerContent onCloseAutoFocus={restoreFocus} className="mx-auto max-w-md">
          <DrawerHeader>
            <DrawerTitle className="truncate text-xl font-bold">
              <bdi>{match.title}</bdi>
            </DrawerTitle>
            <DrawerDescription className="flex flex-col gap-1">
              <span>{t(WARNINGS[copy])}</span>
              {copy !== "none" && match.team !== undefined && <span>{t("home.delete.team")}</span>}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {failed && <FormAlert message={t("home.deleteFailed")} />}
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
              className="h-12 rounded-xl text-base font-semibold"
            >
              {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Trash2 className="size-5" aria-hidden />}
              {t("home.delete")}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" disabled={busy} className="h-12 rounded-xl text-base font-semibold">
                {t("common.cancel")}
              </Button>
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
