import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

async function loadServerEnv() {
  vi.resetModules();
  return (await import("@/server/env")).serverEnv;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("serverEnv", () => {
  it("defaults LIVE_CACHE_SECONDS to 2 when unset or empty", async () => {
    vi.stubEnv("LIVE_CACHE_SECONDS", "");
    expect((await loadServerEnv())().LIVE_CACHE_SECONDS).toBe(2);
  });

  it("reads LIVE_CACHE_SECONDS from the environment", async () => {
    vi.stubEnv("LIVE_CACHE_SECONDS", "5");
    expect((await loadServerEnv())().LIVE_CACHE_SECONDS).toBe(5);
  });

  it("rejects an invalid LIVE_CACHE_SECONDS", async () => {
    vi.stubEnv("LIVE_CACHE_SECONDS", "soon");
    expect((await loadServerEnv())).toThrow("Server configuration is incomplete");
  });
});
