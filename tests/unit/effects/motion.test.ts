import { describe, expect, it } from "vitest";
import { effectsEnabled } from "@/components/effects/motion";

describe("effectsEnabled", () => {
  it("reduced motion disables effects", () => {
    expect(effectsEnabled(() => ({ matches: true }))).toBe(false);
  });

  it("stays off on the server, where there is no matchMedia", () => {
    expect(effectsEnabled(undefined)).toBe(false);
  });

  it("allows effects when the phone has no reduced-motion setting", () => {
    expect(effectsEnabled(() => ({ matches: false }))).toBe(true);
  });
});
