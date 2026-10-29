import { ChevronLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { BackLink } from "./back-link";

type AppBarProps = { title: ReactNode; heading?: boolean; back?: string; close?: string; actions?: ReactNode };

const ICON_LINK =
  "press -ms-2 grid size-11 shrink-0 place-items-center rounded-full outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-haldi/60";

export function AppBar({ title, heading = false, back, close, actions }: AppBarProps) {
  const Title = heading ? "h1" : "span";
  return (
    <header className="sticky top-0 z-30 bg-[#1b2340] pt-[env(safe-area-inset-top)] text-white">
      <div className="mx-auto flex min-h-14 w-full max-w-md items-center gap-2 px-4">
        {back !== undefined && (
          <BackLink href={back} label={t("common.back")} className={ICON_LINK}>
            <ChevronLeft className="size-6 rtl:rotate-180" aria-hidden />
          </BackLink>
        )}
        {close !== undefined && (
          <BackLink href={close} label={t("app.close")} className={ICON_LINK}>
            <X className="size-6" aria-hidden />
          </BackLink>
        )}
        <Title tabIndex={heading ? -1 : undefined} className="flex min-w-0 flex-1 items-center gap-2 text-lg font-bold outline-none">
          {typeof title === "string" ? <bdi className="truncate">{title}</bdi> : title}
        </Title>
        {actions !== undefined && <div className="-me-2 flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}
