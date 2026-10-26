import { describe, expect, it } from "vitest";
import { canTakeOver } from "@/lib/identity/takeover";

const THIS_DEVICE = "device-this";
const OTHER_DEVICE = "device-other";

const server = { status: "in_progress", scoring_device: THIS_DEVICE, last_seq: 12 };
const inStep = { syncState: "synced" as const, lastSeq: 12 };

describe("canTakeOver", () => {
  it("is not offered while this device is scoring and its copy is in step", () => {
    expect(canTakeOver(server, inStep, THIS_DEVICE)).toBe(false);
  });

  it("is not offered while this device has balls the server has not seen yet", () => {
    expect(canTakeOver(server, { syncState: "pending", lastSeq: 15 }, THIS_DEVICE)).toBe(false);
  });

  it("is offered when another phone is the scoring device", () => {
    expect(canTakeOver({ ...server, scoring_device: OTHER_DEVICE }, inStep, THIS_DEVICE)).toBe(true);
    expect(canTakeOver({ ...server, scoring_device: OTHER_DEVICE }, undefined, THIS_DEVICE)).toBe(true);
  });

  it("is offered to finish a take-over that left this device without a copy", () => {
    expect(canTakeOver(server, undefined, THIS_DEVICE)).toBe(true);
  });

  it("is offered to finish a take-over that left this device's copy blocked", () => {
    expect(canTakeOver(server, { syncState: "blocked", lastSeq: 12 }, THIS_DEVICE)).toBe(true);
  });

  it("is offered to finish a take-over that left this device's copy behind the server", () => {
    expect(canTakeOver(server, { syncState: "synced", lastSeq: 11 }, THIS_DEVICE)).toBe(true);
  });

  it("is never offered for a finished match", () => {
    const complete = { ...server, status: "complete", scoring_device: OTHER_DEVICE };
    expect(canTakeOver(complete, undefined, THIS_DEVICE)).toBe(false);
    expect(canTakeOver(complete, { syncState: "blocked", lastSeq: 1 }, THIS_DEVICE)).toBe(false);
  });
});
