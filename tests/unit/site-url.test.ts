import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SITE_URL, matchUrl, siteUrl, teamUrl } from "@/lib/site-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl", () => {
  it("uses the configured public URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cricket.example");
    expect(siteUrl()).toBe("https://cricket.example");
  });

  it("drops trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cricket.example//");
    expect(siteUrl()).toBe("https://cricket.example");
  });

  it("falls back to the local default when nothing is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteUrl()).toBe(DEFAULT_SITE_URL);
  });
});

describe("matchUrl", () => {
  it("points at the live page of the match", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cricket.example/");
    expect(matchUrl("abcd2345")).toBe("https://cricket.example/m/abcd2345");
  });
});

describe("teamUrl", () => {
  it("points at the public team page", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cricket.example/");
    expect(teamUrl("wxyz2345")).toBe("https://cricket.example/t/wxyz2345");
  });
});
