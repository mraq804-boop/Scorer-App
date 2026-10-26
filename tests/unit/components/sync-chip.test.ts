import { describe, expect, it } from "vitest";
import { blockedMessage } from "@/components/sync-chip";

describe("blockedMessage", () => {
  it("says scoring moved only when another phone took over", () => {
    expect(blockedMessage("scoring_moved")).toBe("Not synced — scoring moved to another phone");
  });

  it("explains that this phone's guest session no longer owns the match", () => {
    expect(blockedMessage("not_owner")).toBe("Not synced — this phone's guest session no longer owns this match");
  });
});
