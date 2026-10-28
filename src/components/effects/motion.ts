type MatchMedia = (query: string) => { matches: boolean };

export function effectsEnabled(matchMedia: MatchMedia | undefined): boolean {
  if (matchMedia === undefined) return false;
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function browserEffectsEnabled(): boolean {
  return typeof window !== "undefined" && effectsEnabled(window.matchMedia?.bind(window));
}

export type CountUpStep = "pulse" | "zero" | "wait" | "count";

export function countUpStep(firstLook: boolean, visible: boolean): CountUpStep {
  if (firstLook) return visible ? "pulse" : "zero";
  return visible ? "count" : "wait";
}
