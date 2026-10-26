import { describe, expect, it, vi } from "vitest";
import { createCardLoader } from "@/components/share/card-loader";

function card(name = "scorecard-abcd2345.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

describe("createCardLoader", () => {
  it("has nothing to hand out before the card is loaded", () => {
    const loader = createCardLoader(async () => card());
    expect(loader.peek("score 1")).toBeNull();
  });

  it("waits for the flush before it fetches the card", async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const flushed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loader = createCardLoader(
      async () => {
        order.push("fetch");
        return card();
      },
      async () => {
        await flushed;
        order.push("flushed");
      },
    );

    const loading = loader.load("score 1");
    await Promise.resolve();
    expect(order).toEqual([]);

    release();
    expect(await loading).not.toBeNull();
    expect(order).toEqual(["flushed", "fetch"]);
  });

  it("hands out the loaded card at once, so a tap can share it without waiting", async () => {
    const file = card();
    const loader = createCardLoader(async () => file);
    await loader.load("score 1");
    expect(loader.peek("score 1")).toBe(file);
  });

  it("fetches once for the same score, even when asked twice while it is loading", async () => {
    const fetchCard = vi.fn(async () => card());
    const loader = createCardLoader(fetchCard);

    const [first, second] = await Promise.all([loader.load("score 1"), loader.load("score 1")]);
    await loader.load("score 1");

    expect(first).toBe(second);
    expect(fetchCard).toHaveBeenCalledTimes(1);
  });

  it("fetches again once the score has moved on and does not hand out the old card", async () => {
    const fetchCard = vi.fn(async () => card());
    const loader = createCardLoader(fetchCard);
    await loader.load("score 1");

    expect(loader.peek("score 2")).toBeNull();
    await loader.load("score 2");

    expect(fetchCard).toHaveBeenCalledTimes(2);
    expect(loader.peek("score 1")).toBeNull();
  });

  it("tries again after a failed fetch instead of remembering the failure", async () => {
    const file = card();
    const fetchCard = vi.fn<() => Promise<File | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce(file);
    const loader = createCardLoader(fetchCard);

    expect(await loader.load("score 1")).toBeNull();
    expect(loader.peek("score 1")).toBeNull();
    expect(await loader.load("score 1")).toBe(file);
    expect(fetchCard).toHaveBeenCalledTimes(2);
  });

  it("treats a flush that throws as a failed load", async () => {
    const loader = createCardLoader(
      async () => card(),
      async () => {
        throw new Error("flush failed");
      },
    );
    expect(await loader.load("score 1")).toBeNull();
  });
});
