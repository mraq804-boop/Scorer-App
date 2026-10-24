import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();

vi.mock("@/server/supabase/server", () => ({
  createSupabaseServer: async () => ({ auth: { exchangeCodeForSession } }),
}));

const { GET } = await import("@/app/auth/callback/route");

const ORIGIN = "http://localhost:3100";

async function callback(query: string): Promise<string | null> {
  const response = await GET(new NextRequest(`${ORIGIN}/auth/callback${query}`));
  expect(response.status).toBe(307);
  return response.headers.get("location");
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("/auth/callback", () => {
  it("exchanges the code and redirects to a relative next", async () => {
    expect(await callback("?code=abc&next=/score%3Fm%3D1")).toBe(`${ORIGIN}/score?m=1`);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("defaults next to /account", async () => {
    expect(await callback("?code=abc")).toBe(`${ORIGIN}/account`);
  });

  it.each([
    ["a protocol-relative url", "//evil.example"],
    ["an absolute url", "https://evil.example/x"],
    ["a backslash host","/\\evil.example"],
    ["a bare path", "score"],
  ])("falls back to /account for %s", async (_name, next) => {
    expect(await callback(`?code=abc&next=${encodeURIComponent(next)}`)).toBe(`${ORIGIN}/account`);
  });

  it("redirects to the account error when the code is missing", async () => {
    expect(await callback("?next=/score")).toBe(`${ORIGIN}/account?error=auth`);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to the account error when the exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("bad code") });
    expect(await callback("?code=abc&next=/score")).toBe(`${ORIGIN}/account?error=auth`);
  });
});
