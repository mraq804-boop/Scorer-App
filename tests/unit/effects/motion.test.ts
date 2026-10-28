import { describe, expect, it } from "vitest";
import { countUpStep, effectsEnabled } from "@/components/effects/motion";

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

describe("countUpStep", () => {
  it("leaves a number that was on screen at load where it is, with a pulse", () => {
    expect(countUpStep(true, true)).toBe("pulse");
  });

  it("zeroes a number that starts off screen, then counts it up when it scrolls in", () => {
    expect(countUpStep(true, false)).toBe("zero");
    expect(countUpStep(false, false)).toBe("wait");
    expect(countUpStep(false, true)).toBe("count");
  });
});
