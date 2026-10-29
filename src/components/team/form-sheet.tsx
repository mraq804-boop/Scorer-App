"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

type FormSheetProps = { title: string; open: boolean; onClose: () => void; children: ReactNode };

export function FormSheet({ title, open, onClose, children }: FormSheetProps) {
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent aria-describedby={undefined} className="mx-auto max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[75dvh] overflow-y-auto px-4 pb-6">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

export function FloatingAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-space,0px)+1rem)] z-20">
      <div className="mx-auto flex max-w-md justify-end px-4">
        <button
          type="button"
          onClick={onClick}
          className="press pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full bg-[#1b2340] px-5 font-bold text-white shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-haldi/60"
        >
          <Plus className="size-5" aria-hidden />
          {label}
        </button>
      </div>
    </div>
  );
}
