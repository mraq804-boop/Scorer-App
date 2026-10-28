import { INK } from "@/lib/brand-mark";

export type ColourKey =
  | "emerald"
  | "ocean"
  | "royal"
  | "violet"
  | "crimson"
  | "tangerine"
  | "magenta"
  | "teal"
  | "sky"
  | "charcoal";

export type TeamColour = { key: ColourKey; base: string; dark: string; light: string; on: string };

const WHITE = "#ffffff";

const PALETTE: Record<ColourKey, Omit<TeamColour, "key">> = {
  emerald: { base: "#0F6E56", dark: "#085041", light: "#E1F5EE", on: WHITE },
  ocean: { base: "#185FA5", dark: "#0C447C", light: "#E6F1FB", on: WHITE },
  royal: { base: "#3C3489", dark: "#26215C", light: "#EEEDFE", on: WHITE },
  violet: { base: "#6B2FA3", dark: "#4A1F73", light: "#F1E8FB", on: WHITE },
  crimson: { base: "#A32D2D", dark: "#791F1F", light: "#FCEBEB", on: WHITE },
  tangerine: { base: "#C4501F", dark: "#993C1D", light: "#FAECE7", on: WHITE },
  magenta: { base: "#993556", dark: "#72243E", light: "#FBEAF0", on: WHITE },
  teal: { base: "#0E7C86", dark: "#0A5960", light: "#E0F4F5", on: WHITE },
  sky: { base: "#5AA9E6", dark: "#185FA5", light: "#E6F1FB", on: INK },
  charcoal: { base: "#444441", dark: "#2C2C2A", light: "#F1EFE8", on: WHITE },
};

export const COLOUR_KEYS = Object.keys(PALETTE) as ColourKey[];

export function isColourKey(value: unknown): value is ColourKey {
  return typeof value === "string" && Object.hasOwn(PALETTE, value);
}

export function nameHash(name: string): number {
  let hash = 5381;
  for (const char of name.trim().toLocaleLowerCase()) hash = ((hash << 5) + hash + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash;
}

export function colourFor(key: string | null | undefined, name: string): TeamColour {
  const chosen = isColourKey(key) ? key : COLOUR_KEYS[nameHash(name) % COLOUR_KEYS.length];
  return { key: chosen, ...PALETTE[chosen] };
}

export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("");
  return letters === "" ? "?" : letters.toLocaleUpperCase();
}
