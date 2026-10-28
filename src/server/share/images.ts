import "server-only";

const FETCH_TIMEOUT_MS = 3000;
const ABSOLUTE = /^https?:\/\//;

export type ImageMap = ReadonlyMap<string, string>;

async function embed(url: string): Promise<readonly [string, string] | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return [url, `data:${type};base64,${bytes.toString("base64")}`];
  } catch {
    return null;
  }
}

export async function embedImages(urls: readonly (string | null | undefined)[]): Promise<ImageMap> {
  const wanted = [...new Set(urls.filter((url): url is string => typeof url === "string" && ABSOLUTE.test(url)))];
  const embedded = await Promise.all(wanted.map(embed));
  return new Map(embedded.filter((entry) => entry !== null));
}
