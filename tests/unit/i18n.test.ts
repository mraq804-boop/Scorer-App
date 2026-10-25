import { describe, expect, it } from "vitest";
import { format, t } from "@/lib/i18n";

describe("i18n", () => {
  it("returns the fixed spec copy", () => {
    expect(t("sync.saved")).toBe("Saved on phone");
    expect(t("sync.synced")).toBe("Synced");
    expect(t("prompt.allOut")).toBe("All out — end innings, or add a player?");
    expect(t("sync.blocked")).toBe("Not synced — scoring moved to another phone");
  });

  it("interpolates variables", () => {
    expect(format("{bowler} to {striker}, {runs} runs", { bowler: "Hamza", striker: "Ali", runs: 4 })).toBe(
      "Hamza to Ali, 4 runs",
    );
    expect(format("{n} and {n}", { n: 0 })).toBe("0 and 0");
  });

  it("leaves unknown placeholders and plain text untouched", () => {
    expect(format("{missing} stays", { other: "x" })).toBe("{missing} stays");
    expect(format("no placeholders")).toBe("no placeholders");
  });
});
