import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_for_tests_only_0000");

const createClient = vi.fn(() => ({}));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { createSupabasePublic } = await import("@/server/supabase/public");

describe("createSupabasePublic", () => {
  it("uses the publishable key and keeps no session or cookies", () => {
    createSupabasePublic();

    expect(createClient).toHaveBeenCalledWith("https://project.supabase.co", "sb_publishable_for_tests_only_0000", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });
});
