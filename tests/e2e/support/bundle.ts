import { readFileSync } from "node:fs";
import { join } from "node:path";

export const FORBIDDEN_MODULES = [
  "/src/components/scoring/",
  "/src/components/guest-session",
  "/src/lib/local/",
  "/src/lib/sync/",
  "/src/lib/identity/",
  "/node_modules/dexie/",
  "/node_modules/@supabase/",
];

export const FORBIDDEN_CODE: Record<string, RegExp> = {
  dexie: /Dexie/,
  "supabase-js": /supabase-js|GoTrueClient/,
  turnstile: /challenges\.cloudflare\.com/,
  scoring: /sync-chip/,
};

type Manifest = { clientModules: Record<string, unknown>; entryJSFiles: Record<string, string[]> };

export function clientBundle(route: string): { modules: string[]; code: string } {
  const source = readFileSync(join(".next", "server", "app", ...route.split("/"), "page_client-reference-manifest.js"), "utf8");
  const manifest = JSON.parse(/= (\{.*\});?\s*$/s.exec(source)?.[1] ?? "{}") as Manifest;
  const entry = Object.keys(manifest.entryJSFiles).find((key) => key.endsWith(`/src/app/${route}/page`));
  const files = entry === undefined ? [] : manifest.entryJSFiles[entry];
  return {
    modules: Object.keys(manifest.clientModules),
    code: files.map((file) => readFileSync(join(".next", file), "utf8")).join("\n"),
  };
}

export function forbiddenIn(route: string, extra: Record<string, RegExp> = {}): { modules: string[]; code: string[]; size: number } {
  const { modules, code } = clientBundle(route);
  const patterns = { ...FORBIDDEN_CODE, ...extra };
  return {
    size: code.length,
    modules: modules.filter((module) => FORBIDDEN_MODULES.some((path) => module.includes(path))),
    code: Object.keys(patterns).filter((name) => patterns[name].test(code)),
  };
}
