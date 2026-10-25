import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/sw.js/route";
import { SHELL_PATHS } from "@/app/sw.js/shell";

const ORIGIN = "http://localhost";
const PAGE_CSS = "/_next/static/chunks/page.css";
const PAGE_JS = "/_next/static/chunks/page.js";
const FONT = "/_next/static/media/font.woff2";
const PAYLOAD_ONLY_JS = "/_next/static/chunks/payload-only.js";

const html = [
  `<link rel="stylesheet" href="${PAGE_CSS}" data-precedence="next"/>`,
  `<link rel="preload" href="${FONT}" as="font" crossorigin=""/>`,
  `<script src="${PAGE_JS}" async=""></script>`,
  `<script>self.__next_f.push([1,"\\"${PAYLOAD_ONLY_JS}\\""])</script>`,
].join("");

type Handler = (event: Record<string, unknown>) => void;
type Script = (url: string, attempt: number) => Response;

function relative(input: unknown): string {
  const url = new URL(typeof input === "string" ? input : (input as Request).url, ORIGIN);
  return url.pathname + url.search;
}

function createCache() {
  const entries = new Map<string, Response>();
  return {
    entries,
    async add(input: unknown) {
      const response = await fetchThrough(relative(input));
      if (!response.ok) throw new TypeError(`bad status ${response.status}`);
      entries.set(relative(input), response);
    },
    async addAll(inputs: unknown[]) {
      await Promise.all(inputs.map((input) => this.add(input)));
    },
    async match(input: unknown, options?: { ignoreSearch?: boolean }) {
      const wanted = new URL(relative(input), ORIGIN);
      for (const [key, response] of entries) {
        const candidate = new URL(key, ORIGIN);
        const same = options?.ignoreSearch ? candidate.pathname === wanted.pathname : key === relative(input);
        if (same) return response.clone();
      }
      return undefined;
    },
    async put(input: unknown, response: Response) {
      entries.set(relative(input), response);
    },
  };
}

let fetchThrough: (url: string) => Promise<Response>;

class OriginRequest extends Request {
  constructor(input: string, init?: RequestInit) {
    super(new URL(input, ORIGIN).href, init);
  }
}

function startWorker(script: Script) {
  const attempts = new Map<string, number>();
  const requested: string[] = [];
  fetchThrough = async (url) => {
    const attempt = (attempts.get(url) ?? 0) + 1;
    attempts.set(url, attempt);
    requested.push(url);
    return script(url, attempt);
  };

  const stores = new Map<string, ReturnType<typeof createCache>>();
  const handlers = new Map<string, Handler>();
  const skipWaiting = vi.fn();
  const self = {
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting,
    clients: { claim: vi.fn() },
    location: { origin: ORIGIN },
  };
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, createCache());
      return stores.get(name)!;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };

  const source = GET().text();
  return source.then((code) => {
    new Function("self", "caches", "fetch", "Request", "Response", code)(self, caches, fetchThrough, OriginRequest, Response);
    return {
      stores,
      requested,
      skipWaiting,
      attempts,
      async install() {
        let installed: Promise<unknown> = Promise.resolve();
        handlers.get("install")!({ waitUntil: (promise: Promise<unknown>) => (installed = promise) });
        await installed;
      },
      message(data: unknown) {
        handlers.get("message")!({ data });
      },
    };
  });
}

const page = () => new Response(html, { status: 200, headers: { "content-type": "text/html" } });
const ok = () => new Response("ok", { status: 200 });

function healthy(overrides: Record<string, Script> = {}): Script {
  return (url, attempt) => {
    if (overrides[url]) return overrides[url](url, attempt);
    if (url.startsWith("/_next/static/")) return ok();
    return url === "/manifest.webmanifest" || url.startsWith("/icons/") ? ok() : page();
  };
}

function failing(times: number): Script {
  return (_url, attempt) => (attempt <= times ? new Response("nope", { status: 503 }) : ok());
}

describe("service worker install", () => {
  it("caches the shell pages, the offline screen, the icons and every script, stylesheet and font the pages reference", async () => {
    const worker = await startWorker(healthy());
    await worker.install();

    const shell = worker.stores.get([...worker.stores.keys()].find((name) => name.startsWith("cs-shell-"))!)!;
    const assets = worker.stores.get([...worker.stores.keys()].find((name) => name.startsWith("cs-static-"))!)!;
    expect([...shell.entries.keys()].sort()).toEqual([...SHELL_PATHS, "/offline", "/manifest.webmanifest"].sort());
    expect([...assets.entries.keys()].sort()).toEqual(["/icons/192", "/icons/512", PAGE_CSS, PAGE_JS, FONT].sort());
  });

  it("only follows src and href attributes, not URLs inside inline script text", async () => {
    const worker = await startWorker(healthy());
    await worker.install();
    expect(worker.requested).not.toContain(PAYLOAD_ONLY_JS);
  });

  it("retries a failed script once and installs when the retry succeeds", async () => {
    const worker = await startWorker(healthy({ [PAGE_JS]: failing(1) }));
    await expect(worker.install()).resolves.toBeUndefined();
    expect(worker.attempts.get(PAGE_JS)).toBe(2);
  });

  it("rejects the install when a script still fails after the retry", async () => {
    const worker = await startWorker(healthy({ [PAGE_JS]: failing(2) }));
    await expect(worker.install()).rejects.toThrow();
    expect(worker.attempts.get(PAGE_JS)).toBe(2);
  });

  it("rejects the install when a stylesheet still fails after the retry", async () => {
    const worker = await startWorker(healthy({ [PAGE_CSS]: failing(2) }));
    await expect(worker.install()).rejects.toThrow();
  });

  it("tolerates a font that keeps failing", async () => {
    const worker = await startWorker(healthy({ [FONT]: failing(2) }));
    await expect(worker.install()).resolves.toBeUndefined();
    expect(worker.attempts.get(FONT)).toBe(2);
  });

  it("skips waiting only when asked to", async () => {
    const worker = await startWorker(healthy());
    await worker.install();
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    worker.message("something else");
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    worker.message("SKIP_WAITING");
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });
});
