import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export const REQUEST_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const caller = init.signal;
  if (caller?.aborted) controller.abort(caller.reason);
  else caller?.addEventListener("abort", () => controller.abort(caller.reason), { once: true });
  setTimeout(() => controller.abort(new DOMException("The request timed out.", "TimeoutError")), REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal });
}

export function createSupabaseBrowser() {
  return createBrowserClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: fetchWithTimeout },
  });
}
