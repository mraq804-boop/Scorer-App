import { describe, expect, it } from "vitest";
import { DISMISS_DAYS, installCardVisible, readDismissedAt } from "@/lib/app/install";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 29, 12);

describe("install card", () => {
  it("shows until dismissed, then hides for 14 days", () => {
    expect(DISMISS_DAYS).toBe(14);
    expect(installCardVisible(null, now)).toBe(true);
    expect(installCardVisible(now - 13 * DAY, now)).toBe(false);
    expect(installCardVisible(now - 14 * DAY, now)).toBe(true);
  });

  it("reads a dismissal time and ignores anything else", () => {
    expect(readDismissedAt({ getItem: () => String(now) })).toBe(now);
    expect(readDismissedAt({ getItem: () => "soon" })).toBeNull();
    expect(readDismissedAt({ getItem: () => null })).toBeNull();
  });

  it("a blocked store shows the card", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readDismissedAt(blocked)).toBeNull();
    expect(readDismissedAt(null)).toBeNull();
    expect(installCardVisible(null, now)).toBe(true);
  });
});
