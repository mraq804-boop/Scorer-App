"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Check } from "lucide-react";
import { useId, useState } from "react";
import { Avatar } from "@/components/team-page/avatar";
import { Button } from "@/components/ui/button";
import { COLOUR_KEYS, colourFor, logoPath, logoUrl, nextPictureVersion } from "@/lib/brand";
import { t } from "@/lib/i18n";
import type { CachedTeam } from "@/lib/local/db";
import { LOGO_SIZE } from "@/lib/media/prepare-image";
import { deleteTeamPicture, replaceTeamPicture, setTeamColour, setTeamLogo } from "@/lib/team/remote";
import { cn } from "@/lib/utils";
import { FormAlert, teamErrorMessage } from "./form";
import { PictureInput } from "./picture-input";

type BrandEditorProps = { client: SupabaseClient; team: CachedTeam; onChanged: () => Promise<void> };

export function BrandEditor({ client, team, onChanged }: BrandEditorProps) {
  const headingId = useId();
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const colour = colourFor(team.colour, team.name);
  const current = team.logoVersion ?? null;

  const run = async (work: () => Promise<string | undefined>) => {
    setBusy(true);
    setError(undefined);
    try {
      const failure = await work();
      if (failure === undefined) await onChanged();
      else setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const pickColour = (key: string) =>
    run(async () => {
      const result = await setTeamColour(client, key);
      return result.ok ? undefined : teamErrorMessage(result.error);
    });

  const uploadLogo = (blob: Blob) =>
    run(async () => {
      const version = nextPictureVersion(current);
      const result = await replaceTeamPicture(client, {
        newPath: logoPath(team.code, version),
        oldPath: current === null ? null : logoPath(team.code, current),
        blob,
        save: () => setTeamLogo(client, version),
      });
      return result.ok ? undefined : teamErrorMessage(result.error);
    });

  const removeLogo = () =>
    run(async () => {
      const result = await setTeamLogo(client, null);
      if (!result.ok) return teamErrorMessage(result.error);
      if (current !== null) await deleteTeamPicture(client, logoPath(team.code, current));
      return undefined;
    });

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-bold">
          {t("brand.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("brand.body")}</p>
      </div>
      <div className="flex items-center gap-4">
        <Avatar
          name={team.name}
          url={logoUrl(team.code, current)}
          size={72}
          colour={colour}
          alt={t("brand.logoAlt", { name: team.name })}
          className="ring-4 ring-haldi"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <PictureInput
            label={t(current === null ? "brand.uploadLogo" : "brand.changeLogo")}
            size={LOGO_SIZE}
            onPicked={uploadLogo}
            onError={setError}
            className="h-11 rounded-xl border px-4 text-base font-semibold hover:bg-muted"
          >
            {t(current === null ? "brand.uploadLogo" : "brand.changeLogo")}
          </PictureInput>
          {current !== null && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void removeLogo()} className="h-10 rounded-xl">
              {t("brand.removeLogo")}
            </Button>
          )}
        </div>
      </div>
      <div role="radiogroup" aria-label={t("brand.colour")} className="grid grid-cols-5 gap-2">
        {COLOUR_KEYS.map((key) => {
          const swatch = colourFor(key, team.name);
          const chosen = team.colour === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={t(`brand.colour.${key}`)}
              disabled={busy}
              onClick={() => void pickColour(key)}
              style={{ background: swatch.base, color: swatch.on }}
              className={cn(
                "grid h-11 place-items-center rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                chosen && "ring-3 ring-haldi",
              )}
            >
              {chosen && <Check className="size-5" aria-hidden />}
            </button>
          );
        })}
      </div>
      {error !== undefined && <FormAlert message={error} />}
    </section>
  );
}
