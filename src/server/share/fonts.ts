import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SANS = "Noto Sans";
export const NASKH = "Noto Naskh Arabic";

type ImageFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

const FONT_DIR = join(process.cwd(), "src", "assets", "fonts");

const FONT_FILES = [
  { name: SANS, weight: 400, file: "noto-sans/NotoSans-Regular.ttf" },
  { name: SANS, weight: 700, file: "noto-sans/NotoSans-Bold.ttf" },
  { name: NASKH, weight: 400, file: "noto-naskh-arabic/NotoNaskhArabic-Regular.ttf" },
  { name: NASKH, weight: 700, file: "noto-naskh-arabic/NotoNaskhArabic-Bold.ttf" },
] as const;

let loaded: Promise<ImageFont[]> | undefined;

async function readFonts(): Promise<ImageFont[]> {
  return Promise.all(
    FONT_FILES.map(async ({ name, weight, file }) => {
      const bytes = await readFile(join(FONT_DIR, file));
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      return { name, data, weight, style: "normal" as const };
    }),
  );
}

export function loadImageFonts(): Promise<ImageFont[]> {
  loaded ??= readFonts().catch((error: unknown) => {
    loaded = undefined;
    throw error;
  });
  return loaded;
}
