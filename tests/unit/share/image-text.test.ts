import { describe, expect, it } from "vitest";
import { imageText } from "@/lib/share/image-text";

describe("imageText", () => {
  it("leaves Latin text alone", () => {
    expect(imageText("Lions 87/3 (11.4 ov)")).toBe("Lions 87/3 (11.4 ov)");
  });

  it("tidies whitespace", () => {
    expect(imageText("  Lions \n  Tigers  ")).toBe("Lions Tigers");
  });

  it("drops emoji, flags, joined emoji and keycaps that the fonts cannot draw", () => {
    expect(imageText("🦁 Lions 🏏")).toBe("Lions");
    expect(imageText("🇵🇰 Pakistan")).toBe("Pakistan");
    expect(imageText("👨‍👩‍👧 Family 👍🏽")).toBe("Family");
    expect(imageText("1️⃣ XI")).toBe("1 XI");
  });

  it("joins the letters of an Urdu word and writes them in drawing order", () => {
    expect(imageText("لاہور")).toBe("ﺭﻮﮨﻻ");
    expect(imageText("ٹیم")).toBe("ﻢﯿﭨ");
    expect(imageText("پاکستان")).toBe("ﻥﺎﺘﺴﮐﺎﭘ");
  });

  it("uses the lam-alef ligature, isolated or joined to the letter before", () => {
    expect(imageText("لا")).toBe("ﻻ");
    expect(imageText("بلا")).toBe("ﻼﺑ");
  });

  it("breaks the join at a zero-width non-joiner and drops it", () => {
    expect(imageText("بب")).toBe("ﺐﺑ");
    expect(imageText("ب‌ب")).toBe("ﺏﺏ");
  });

  it("strips vowel marks so they do not float over the wrong letter", () => {
    expect(imageText("مُحَمَّد")).toBe(imageText("محمد"));
  });

  it("puts a right-to-left phrase in drawing order as one block", () => {
    expect(imageText("لاہور قلندرز")).toBe(`${imageText("قلندرز")} ${imageText("لاہور")}`);
  });

  it("keeps Latin words and numbers in order around Urdu words", () => {
    expect(imageText("Lahore لاہور Lions")).toBe(`Lahore ${imageText("لاہور")} Lions`);
    expect(imageText("کراچی 11")).toBe(`${imageText("کراچی")} 11`);
    expect(imageText("لاہور 11 کراچی")).toBe(`${imageText("لاہور")} 11 ${imageText("کراچی")}`);
  });

  it("keeps an Arabic comma inside the right-to-left block", () => {
    expect(imageText("لاہور، کراچی")).toBe(`${imageText("کراچی")} ،${imageText("لاہور")}`);
  });

  it("copes with emoji next to Urdu", () => {
    expect(imageText("🦁 لاہور 🦁")).toBe(imageText("لاہور"));
  });

  it("returns an empty string for nothing but emoji", () => {
    expect(imageText("🦁🐯")).toBe("");
  });
});
