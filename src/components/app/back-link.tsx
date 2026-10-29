"use client";

import type { MouseEvent, ReactNode } from "react";
import { goesBack } from "@/lib/app/frame";

type BackLinkProps = { href: string; label: string; className?: string; children: ReactNode };

export function BackLink({ href, label, className, children }: BackLinkProps) {
  const back = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!goesBack(document.referrer, window.location.origin, window.history.length)) return;
    event.preventDefault();
    window.history.back();
  };
  return (
    <a href={href} aria-label={label} onClick={back} className={className}>
      {children}
    </a>
  );
}
