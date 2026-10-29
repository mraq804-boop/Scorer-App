"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/segmented-control";
import { t } from "@/lib/i18n";

type Theme = "system" | "light" | "dark";

const OPTIONS: readonly { value: Theme; label: string }[] = [
  { value: "system", label: t("theme.system") },
  { value: "light", label: t("theme.light") },
  { value: "dark", label: t("theme.dark") },
];

function isTheme(value: string | undefined): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

export function Appearance() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  if (!mounted) return <div aria-hidden className="h-[4.5rem]" />;
  return (
    <div className="px-4 py-3">
      <SegmentedControl label={t("account.appearance")} value={isTheme(theme) ? theme : "system"} options={OPTIONS} onChange={setTheme} />
    </div>
  );
}
