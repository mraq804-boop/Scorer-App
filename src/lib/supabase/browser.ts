import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export const BASE_TIMEOUT_MS = 20_000;
const TIMEOUT_PER_KB_MS = 1_000;
const BYTES_PER_KB = 1024;

function bodyBytes(body: RequestInit["body"]): number {
  if (typeof body === "string") return new TextEncoder().encode(body).length;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength;
  return 0;
}

export function requestTimeoutMs(body: RequestInit["body"]): number {
  return BASE_TIMEOUT_MS + Math.ceil(bodyBytes(body) / BYTES_PER_KB) * TIMEOUT_PER_KB_MS;
}

export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (init.signal) return fetch(input, init);
  const controller = new AbortController();
  setTimeout(
    () => controller.abort(new DOMException("The request timed out.", "TimeoutError")),
    requestTimeoutMs(init.body),
  );
  return fetch(input, { ...init, signal: controller.signal });
}

export function createSupabaseBrowser() {
  return createBrowserClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: fetchWithTimeout },
  });
}
