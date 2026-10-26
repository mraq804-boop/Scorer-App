import { describe, expect, it } from "vitest";
import { choosePlayer, previousBowlers, suggestNames } from "@/components/scoring/player-drafts";
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

describe("previousBowlers", () => {
  const SIX_DOTS = [0, 0, 0, 0, 0, 0];

  function bowlAgain(m: TestMatch, name: string): void {
    m.push({ type: "bowler_changed", player: m.id(name) });
  }

  function names(m: TestMatch): string[] {
    return previousBowlers(m.inn).map((line) => m.state.players[line.playerId]?.name ?? line.playerId);
  }

  it("lists the bowler who just finished an over last at the over break", () => {
    const m = new TestMatch();
    m.over(SIX_DOTS);
    m.bowler("Bilal");
    m.over(SIX_DOTS);
    bowlAgain(m, "Hamza");
    m.over(SIX_DOTS);

    expect(m.inn.bowler).toBeNull();
    expect(names(m)).toEqual(["Bilal", "Hamza"]);
  });

  it("treats whoever bowled the last ball of a split over as the one who just finished", () => {
    const m = new TestMatch();
    m.over(SIX_DOTS);
    m.bowler("Bilal");
    m.over([0, 0, 0]);
    bowlAgain(m, "Hamza");
    m.over([0, 0, 0]);

    expect(m.inn.bowler).toBeNull();
    expect(names(m)).toEqual(["Bilal", "Hamza"]);
  });

  it("leaves out the current bowler mid-over and keeps the order they first bowled in", () => {
    const m = new TestMatch();
    m.over(SIX_DOTS);
    m.bowler("Bilal");
    m.over(SIX_DOTS);
    m.bowler("Kamran");
    m.over(SIX_DOTS);
    bowlAgain(m, "Hamza");
    m.over([0, 0]);

    expect(names(m)).toEqual(["Bilal", "Kamran"]);
  });
});
