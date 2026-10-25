"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { GuestSession } from "@/components/guest-session";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { t } from "@/lib/i18n";

function ScoreScreen() {
  const matchId = useSearchParams().get("m");
  return (
    <p className="text-muted-foreground" data-match-id={matchId ?? ""}>
      {t("score.loading")}
    </p>
  );
}

export default function ScorePage() {
  return (
    <main data-testid="score-shell" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <Suspense fallback={<p className="text-muted-foreground">{t("score.loading")}</p>}>
        <ScoreScreen />
      </Suspense>
      <GuestSession />
      <PwaRegister />
    </main>
  );
}
