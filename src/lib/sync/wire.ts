import type { MatchEvent } from "@/lib/scoring";

export type WireEvent = {
  id: string;
  seq: number;
  at: string;
  type: MatchEvent["type"];
  payload: Record<string, unknown>;
};

export function toWire(event: MatchEvent): WireEvent {
  const { id, seq, at, type, ...payload } = event;
  return { id, seq, at, type, payload };
}

export function fromWire(wire: WireEvent): MatchEvent {
  const { id, seq, at, type, payload } = wire;
  return { ...payload, id, seq, at, type } as MatchEvent;
}
