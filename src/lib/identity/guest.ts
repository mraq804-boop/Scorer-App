import type { SupabaseClient } from "@supabase/supabase-js";

export type GuestSessionResult = "existing" | "created" | "offline";

function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export async function ensureGuestSession(
  client: SupabaseClient,
  getCaptchaToken?: () => Promise<string>,
): Promise<GuestSessionResult> {
  const { data, error } = await client.auth.getSession();
  if (data.session !== null) return "existing";
  if (isOffline()) return "offline";
  if (error !== null) throw error;
  const captchaToken = getCaptchaToken === undefined ? undefined : await getCaptchaToken();
  const signedIn = await client.auth.signInAnonymously({ options: { captchaToken } });
  if (signedIn.error !== null) throw signedIn.error;
  return "created";
}

export type GuestSessionKeeper = {
  ensure: () => Promise<GuestSessionResult | undefined>;
  isReady: () => Promise<boolean>;
};

export function guestSessionKeeper(
  client: SupabaseClient,
  getCaptchaToken: (() => Promise<string>) | undefined,
  onSettled: (outcome: GuestSessionResult | undefined) => void,
): GuestSessionKeeper {
  let signingIn: Promise<GuestSessionResult | undefined> | undefined;

  const ensure = () => {
    signingIn ??= ensureGuestSession(client, getCaptchaToken)
      .catch(() => undefined)
      .then((outcome) => {
        signingIn = undefined;
        onSettled(outcome);
        return outcome;
      });
    return signingIn;
  };

  const isReady = async () => {
    const ready = await client.auth.getSession().then(
      ({ data }) => data.session !== null,
      () => false,
    );
    if (!ready && !isOffline()) void ensure();
    return ready;
  };

  return { ensure, isReady };
}
