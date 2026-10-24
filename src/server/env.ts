import "server-only";
import { z } from "zod";

const schema = z.object({
  LIVE_CACHE_SECONDS: z.coerce.number().int().positive().default(2),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse({ LIVE_CACHE_SECONDS: process.env.LIVE_CACHE_SECONDS || undefined });
    if (!parsed.success) {
      throw new Error(`Server configuration is incomplete: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}
