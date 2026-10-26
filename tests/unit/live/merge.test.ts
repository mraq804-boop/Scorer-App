import { describe, expect, it } from "vitest";
import { contiguousPrefix, mergeEvents } from "@/lib/live/merge";
import { replay } from "@/lib/scoring";
import type { MatchEvent } from "@/lib/scoring";
import { TestMatch } from "../../helpers/match";

function event(seq: number, id = `e${seq}`): MatchEvent {
  return { id, seq, at: "2026-10-23T10:00:00.000Z", type: "strike_swapped" };
}

function seqs(events: readonly MatchEvent[]): number[] {
  return events.map((e) => e.seq);
}

describe("mergeEvents", () => {
  it("dedupes by id, sorts by seq, reports gaps", () => {
    const withGap = mergeEvents([event(1), event(2)], [event(3), event(2), event(5)]);
    expect(seqs(withGap.events)).toEqual([1, 2, 3, 5]);
    expect(withGap.gap).toBe(true);

    const contiguous = mergeEvents([event(1), event(2)], [event(3)]);
    expect(seqs(contiguous.events)).toEqual([1, 2, 3]);
    expect(contiguous.gap).toBe(false);
  });

  it("keeps the first copy when the same id arrives twice", () => {
    const first = event(2);
    const merged = mergeEvents([event(1), first], [{ ...event(2), at: "2030-01-01T00:00:00.000Z" }]);
    expect(merged.events[1]).toBe(first);
  });

  it("accepts events that arrive newest first and fills a gap when the missing ones turn up", () => {
    const arrived = mergeEvents([event(1)], [event(4), event(3)]);
    expect(seqs(arrived.events)).toEqual([1, 3, 4]);
    expect(arrived.gap).toBe(true);

    const filled = mergeEvents(arrived.events, [event(2)]);
    expect(seqs(filled.events)).toEqual([1, 2, 3, 4]);
    expect(filled.gap).toBe(false);
  });

  it("treats a list that does not start at 1 as a gap", () => {
    expect(mergeEvents([], [event(2), event(3)]).gap).toBe(true);
    expect(mergeEvents([], []).gap).toBe(false);
  });

  it("does not mutate its inputs", () => {
    const current = [event(2), event(1)];
    const incoming = [event(3)];
    mergeEvents(current, incoming);
    expect(seqs(current)).toEqual([2, 1]);
    expect(seqs(incoming)).toEqual([3]);
  });

  it("never double-counts a ball delivered by both realtime and polling, in any order", () => {
    const match = new TestMatch();
    match.ball({ runs: 4, boundary: true });
    match.ball({ runs: 1 });
    match.ball({ runs: 2 });
    const all = match.events;
    const setup = all.filter((e) => e.type !== "delivery");
    const balls = all.filter((e) => e.type === "delivery");

    const viaRealtime = mergeEvents(setup, [balls[2], balls[1]]);
    const viaPolling = mergeEvents(viaRealtime.events, [...balls, ...balls]);

    expect(viaRealtime.gap).toBe(true);
    expect(viaPolling.gap).toBe(false);
    expect(viaPolling.events).toEqual(all);
    expect(replay(viaPolling.events)).toEqual(match.state);
    expect(match.inn.runs).toBe(7);
  });
});

describe("contiguousPrefix", () => {
  it("stops at the first missing seq", () => {
    expect(seqs(contiguousPrefix([event(1), event(2), event(4), event(5)]))).toEqual([1, 2]);
    expect(seqs(contiguousPrefix([event(2), event(3)]))).toEqual([]);
    expect(seqs(contiguousPrefix([event(1), event(2), event(3)]))).toEqual([1, 2, 3]);
  });
});
