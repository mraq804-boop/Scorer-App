import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchEvent, Rules } from "@/lib/scoring";
import type { MatchSummary } from "@/lib/share/summary";
import { toWire } from "./wire";

export type PushMatch = {
  id: string;
  code: string;
  title: string;
  teamA: string;
  teamB: string;
  rules: Rules;
  status: "in_progress" | "complete";
  summary: MatchSummary;
};

export type PushError =
  | "network"
  | "not_signed_in"
  | "not_owner"
  | "scoring_moved"
  | "code_taken"
  | "refused"
  | "unknown";

export type PushResult = { ok: true; lastSeq: number } | { ok: false; error: PushError };

export type PushFn = (args: { match: PushMatch; device: string; events: MatchEvent[] }) => Promise<PushResult>;

const SERVER_ERRORS: readonly PushError[] = ["not_signed_in", "not_owner", "scoring_moved", "code_taken"];
const REFUSALS: readonly string[] = ["invalid_event", "too_many_events", "quota_exceeded"];

type RpcError = { message: string; code?: string };

function isTransient(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function isConstraintViolation(error: RpcError, status: number): boolean {
  return status === 409 || error.code?.startsWith("23") === true || /violates .* constraint/i.test(error.message);
}

function failure(error: RpcError, status: number): PushError {
  if (isTransient(status)) return "network";
  if (status === 401) return "not_signed_in";
  if (REFUSALS.includes(error.message) || isConstraintViolation(error, status)) return "refused";
  return SERVER_ERRORS.find((code) => code === error.message) ?? "unknown";
}

export function supabasePush(client: SupabaseClient): PushFn {
  return async ({ match, device, events }) => {
    try {
      const { data, error, status } = await client.rpc("push_match_events", {
        p_match: match,
        p_device: device,
        p_events: events.map(toWire),
      });
      if (error !== null) {
        return { ok: false, error: failure(error, status) };
      }
      return typeof data === "number" ? { ok: true, lastSeq: data } : { ok: false, error: "unknown" };
    } catch {
      return { ok: false, error: "network" };
    }
  };
}
