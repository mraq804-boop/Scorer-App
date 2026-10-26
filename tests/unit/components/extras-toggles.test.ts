import { describe, expect, it } from "vitest";
import { NO_EXTRAS, isAvailable, isPressed, toggleExtra } from "@/components/scoring/extras-toggles";
import type { ExtraToggle, ExtrasSelection } from "@/components/scoring/extras-toggles";

function press(...toggles: ExtraToggle[]): ExtrasSelection {
  return toggles.reduce(toggleExtra, NO_EXTRAS);
}

describe("extras toggles", () => {
  it("starts with a legal ball off the bat", () => {
    expect(NO_EXTRAS).toEqual({ kind: "legal", runsAs: "bat" });
  });

  it("turns each toggle on and off again", () => {
    expect(press("wide")).toEqual({ kind: "wide", runsAs: "bat" });
    expect(press("noball")).toEqual({ kind: "noball", runsAs: "bat" });
    expect(press("bye")).toEqual({ kind: "legal", runsAs: "bye" });
    expect(press("legbye")).toEqual({ kind: "legal", runsAs: "legbye" });
    for (const toggle of ["wide", "noball", "bye", "legbye"] as const) {
      expect(press(toggle, toggle)).toEqual(NO_EXTRAS);
    }
  });

  it("keeps wide and no-ball mutually exclusive", () => {
    expect(press("wide", "noball")).toEqual({ kind: "noball", runsAs: "bat" });
    expect(press("noball", "wide")).toEqual({ kind: "wide", runsAs: "bat" });
  });

  it("keeps bye and leg-bye mutually exclusive", () => {
    expect(press("bye", "legbye")).toEqual({ kind: "legal", runsAs: "legbye" });
    expect(press("legbye", "bye")).toEqual({ kind: "legal", runsAs: "bye" });
  });

  it("never combines a wide with byes or leg-byes", () => {
    expect(press("bye", "wide")).toEqual({ kind: "wide", runsAs: "bat" });
    expect(press("legbye", "wide")).toEqual({ kind: "wide", runsAs: "bat" });
  });

  it("keeps the wide when Bye or Leg-bye is pressed during it, because runs on a wide are wides", () => {
    expect(press("wide", "bye")).toEqual({ kind: "wide", runsAs: "bat" });
    expect(press("wide", "legbye")).toEqual({ kind: "wide", runsAs: "bat" });
    expect(press("wide", "bye", "wide")).toEqual(NO_EXTRAS);
  });

  it("disables Bye and Leg-bye only while Wide is pressed", () => {
    const wide = press("wide");
    expect(isAvailable(wide, "bye")).toBe(false);
    expect(isAvailable(wide, "legbye")).toBe(false);
    expect(isAvailable(wide, "wide")).toBe(true);
    expect(isAvailable(wide, "noball")).toBe(true);
    for (const selection of [NO_EXTRAS, press("noball"), press("bye"), press("noball", "legbye")]) {
      for (const toggle of ["wide", "noball", "bye", "legbye"] as const) {
        expect(isAvailable(selection, toggle)).toBe(true);
      }
    }
  });

  it("allows byes and leg-byes off a no-ball", () => {
    expect(press("noball", "bye")).toEqual({ kind: "noball", runsAs: "bye" });
    expect(press("legbye", "noball")).toEqual({ kind: "noball", runsAs: "legbye" });
  });

  it("reports which toggles are pressed", () => {
    const selection = press("noball", "legbye");
    expect(isPressed(selection, "noball")).toBe(true);
    expect(isPressed(selection, "legbye")).toBe(true);
    expect(isPressed(selection, "wide")).toBe(false);
    expect(isPressed(selection, "bye")).toBe(false);
  });
});
