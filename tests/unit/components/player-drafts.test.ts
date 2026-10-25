import { describe, expect, it } from "vitest";
import { choosePlayer, suggestNames } from "@/components/scoring/player-drafts";
import { TestMatch } from "../../helpers/match";

describe("choosePlayer", () => {
  it("reuses a player of the same team whatever the case or spacing", () => {
    const m = new TestMatch();
    expect(choosePlayer(m.state, "A", "  ali ")).toEqual({ id: m.id("Ali"), drafts: [] });
  });

  it("adds a new player with a fresh id and the trimmed name", () => {
    const m = new TestMatch();
    const choice = choosePlayer(m.state, "A", " Saad ");
    expect(choice.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(choice.drafts).toEqual([{ type: "player_added", player: { id: choice.id, name: "Saad", team: "A" } }]);
  });

  it("never reuses a player from the other team", () => {
    const m = new TestMatch();
    const choice = choosePlayer(m.state, "A", "Hamza");
    expect(choice.id).not.toBe(m.id("Hamza"));
    expect(choice.drafts).toHaveLength(1);
  });

  it("skips players the caller can't reuse", () => {
    const m = new TestMatch();
    const choice = choosePlayer(m.state, "A", "Ali", (player) => player.id !== m.id("Ali"));
    expect(choice.id).not.toBe(m.id("Ali"));
    expect(choice.drafts).toEqual([{ type: "player_added", player: { id: choice.id, name: "Ali", team: "A" } }]);
  });
});

describe("suggestNames", () => {
  it("offers the team's players first, then recent names, without repeats", () => {
    const m = new TestMatch();
    expect(suggestNames(m.state, "A", ["Saad", "ali", "Kamran"])).toEqual(["Ali", "Usman", "Saad", "Kamran"]);
  });

  it("leaves out the other team's players and players the caller skips", () => {
    const m = new TestMatch();
    const skip = (player: { id: string }) => player.id === m.id("Ali");
    expect(suggestNames(m.state, "A", ["Hamza", "ALI", "Saad"], skip)).toEqual(["Usman", "Saad"]);
  });
});
