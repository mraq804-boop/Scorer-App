import { afterEach, describe, expect, it, vi } from "vitest";
import { embedImages } from "@/server/share/images";

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(map: Record<string, { status: number; type: string }>) {
  const fetch = vi.fn(async (url: string) => {
    const reply = map[url];
    if (reply === undefined) throw new Error("offline");
    return new Response(new Uint8Array([1, 2, 3]), { status: reply.status, headers: { "content-type": reply.type } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("embedImages", () => {
  it("embeds pictures that load and skips the rest", async () => {
    const fetch = respond({
      "https://x.test/ok.jpg": { status: 200, type: "image/jpeg" },
      "https://x.test/gone.jpg": { status: 404, type: "text/plain" },
      "https://x.test/page.html": { status: 200, type: "text/html" },
    });

    const images = await embedImages([
      "https://x.test/ok.jpg",
      "https://x.test/ok.jpg",
      "https://x.test/gone.jpg",
      "https://x.test/page.html",
      "https://x.test/offline.jpg",
      "/relative.jpg",
      null,
    ]);

    expect([...images.entries()]).toEqual([["https://x.test/ok.jpg", "data:image/jpeg;base64,AQID"]]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
