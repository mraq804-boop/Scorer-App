import { t } from "@/lib/i18n";
import type { Season } from "@/lib/team";
import { cn } from "@/lib/utils";

type SeasonLinksProps = { basePath: string; seasons: Season[]; selected: string | null };

export function SeasonLinks({ basePath, seasons, selected }: SeasonLinksProps) {
  const options = [{ id: null, name: t("teamPage.allTime") }, ...[...seasons].reverse()];
  return (
    <nav aria-label={t("teamPage.seasons")} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {options.map((option) => {
          const current = option.id === selected;
          return (
            <li key={option.id ?? "all"} className="shrink-0">
              <a
                href={`${basePath}?season=${option.id ?? "all"}`}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 max-w-48 items-center rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  current ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                <bdi className="truncate">{option.name}</bdi>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
