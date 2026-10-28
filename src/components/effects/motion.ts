type MatchMedia = (query: string) => { matches: boolean };

export function effectsEnabled(matchMedia: MatchMedia | undefined): boolean {
  if (matchMedia === undefined) return false;
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function browserEffectsEnabled(): boolean {
  return typeof window !== "undefined" && effectsEnabled(window.matchMedia?.bind(window));
}
