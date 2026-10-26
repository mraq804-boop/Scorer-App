import { describe, expect, it } from "vitest";
import { realtimeUrl } from "@/lib/live/use-live-events";

describe("realtimeUrl", () => {
  it.each([
    ["https://project.supabase.co", "wss://project.supabase.co/realtime/v1"],
    ["https://project.supabase.co/", "wss://project.supabase.co/realtime/v1"],
    ["http://127.0.0.1:54321", "ws://127.0.0.1:54321/realtime/v1"],
    ["https://proxy.example/supabase", "wss://proxy.example/supabase/realtime/v1"],
  ])("builds the WebSocket endpoint for %s like supabase-js", (base, expected) => {
    expect(realtimeUrl(base)).toBe(expected);
  });
});
