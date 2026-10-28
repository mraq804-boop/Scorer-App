import { describe, expect, it } from "vitest";
import { imageFailed } from "@/components/team-page/avatar";

describe("imageFailed", () => {
  it("spots a picture that tried to load and broke", () => {
    expect(imageFailed({ complete: true, naturalWidth: 0, currentSrc: "https://x.test/a.jpg" })).toBe(true);
  });

  it("leaves a loaded picture alone", () => {
    expect(imageFailed({ complete: true, naturalWidth: 384, currentSrc: "https://x.test/a.jpg" })).toBe(false);
  });

  it("leaves a picture that is still loading, or lazily not started, alone", () => {
    expect(imageFailed({ complete: false, naturalWidth: 0, currentSrc: "https://x.test/a.jpg" })).toBe(false);
    expect(imageFailed({ complete: true, naturalWidth: 0, currentSrc: "" })).toBe(false);
  });
});
