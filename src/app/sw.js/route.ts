import { SHELL_PATHS } from "./shell";

const VERSION = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString(36);

const SOURCE = String.raw`
const VERSION = ${JSON.stringify(VERSION)};
const STATIC_CACHE = "cs-static-" + VERSION;
const SHELL_CACHE = "cs-shell-" + VERSION;
const SHELL_PATHS = ${JSON.stringify(SHELL_PATHS)};
const OFFLINE_URL = "/offline";
const SHELL_PRECACHE = [...SHELL_PATHS, OFFLINE_URL, "/manifest.webmanifest"];
const ICON_PRECACHE = ["/icons/192", "/icons/512"];

const STATIC_ASSET = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;

const fresh = (url) => new Request(url, { cache: "reload" });
const isCode = (url) => /\.(?:js|css)(?:\?|$)/.test(url);

async function addWithRetry(cache, url) {
  try {
    await cache.add(url);
  } catch {
    await cache.add(url);
  }
}

async function precacheAssets(cache, pages) {
  const urls = new Set(pages.flatMap((html) => [...html.matchAll(STATIC_ASSET)].map((match) => match[1].replace(/&amp;/g, "&"))));
  await Promise.all(
    [...urls].map((url) =>
      addWithRetry(cache, url).catch((error) => {
        if (isCode(url)) throw error;
      }),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const assets = await caches.open(STATIC_CACHE);
      await shell.addAll(SHELL_PRECACHE.map(fresh));
      await assets.addAll(ICON_PRECACHE.map(fresh));
      const pages = await Promise.all([...SHELL_PATHS, OFFLINE_URL].map(async (path) => (await shell.match(path)).text()));
      await precacheAssets(assets, pages);
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("cs-") && key !== STATIC_CACHE && key !== SHELL_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

async function cacheFirst(event) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.status === 200) event.waitUntil(cache.put(event.request, res.clone()));
  return res;
}

async function networkOrOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const shell = await caches.open(SHELL_CACHE);
    return (await shell.match(OFFLINE_URL)) ?? new Response("Offline", { status: 503 });
  }
}

async function shellPage(request) {
  const shell = await caches.open(SHELL_CACHE);
  const hit = await shell.match(request, { ignoreSearch: true, ignoreVary: true });
  return hit ?? networkOrOffline(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(event));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(SHELL_PATHS.includes(url.pathname) ? shellPage(request) : networkOrOffline(request));
  }
});
`;

export function GET() {
  return new Response(SOURCE, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-cache, no-store, must-revalidate",
      "service-worker-allowed": "/",
    },
  });
}
