"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useEffect, useRef, useState } from "react";
import { publicEnv } from "@/lib/env";
import { completeClaim } from "@/lib/identity/google";
import { guestSessionKeeper } from "@/lib/identity/guest";
import { getLocalDb } from "@/lib/local/db";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { supabasePush } from "@/lib/sync/push";
import { requestSync, startSyncLoop } from "@/lib/sync/sync";
import { supabaseSquadPush } from "@/lib/team/remote";

type TokenWaiter = { resolve: (token: string) => void; reject: (reason: Error) => void };

export function GuestSession() {
  const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const widget = useRef<TurnstileInstance>(null);
  const waiter = useRef<TokenWaiter | undefined>(undefined);
  const [captchaMounted, setCaptchaMounted] = useState(false);

  useEffect(() => {
    let client: ReturnType<typeof createSupabaseBrowser>;
    try {
      client = createSupabaseBrowser();
    } catch {
      return;
    }
    const db = getLocalDb();

    const getCaptchaToken = () =>
      new Promise<string>((resolve, reject) => {
        waiter.current?.reject(new Error("superseded"));
        waiter.current = { resolve, reject };
        if (widget.current === null) setCaptchaMounted(true);
        else widget.current.reset();
      });

    const session = guestSessionKeeper(client, siteKey === undefined ? undefined : getCaptchaToken, (outcome) => {
      if (outcome === "created" || outcome === "existing") setCaptchaMounted(false);
      if (outcome === "created") requestSync();
    });

    const stopSync = startSyncLoop({
      db,
      push: supabasePush(client),
      claim: async () => {
        await completeClaim(client, db);
      },
      isReady: session.isReady,
      pushSquad: supabaseSquadPush(client),
    });
    const onOnline = () => void session.ensure();
    window.addEventListener("online", onOnline);
    void session.ensure();

    return () => {
      window.removeEventListener("online", onOnline);
      waiter.current?.reject(new Error("unmounted"));
      waiter.current = undefined;
      stopSync();
    };
  }, [siteKey]);

  function settle(token: string | Error) {
    const current = waiter.current;
    waiter.current = undefined;
    if (typeof token === "string") current?.resolve(token);
    else current?.reject(token);
  }

  if (siteKey === undefined || !captchaMounted) return null;
  return (
    <Turnstile
      ref={widget}
      siteKey={siteKey}
      options={{ appearance: "interaction-only" }}
      onSuccess={(token) => settle(token)}
      onError={() => settle(new Error("captcha failed"))}
      onTimeout={() => settle(new Error("captcha timed out"))}
      scriptOptions={{ onError: () => settle(new Error("captcha script failed")) }}
    />
  );
}
