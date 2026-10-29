export type TabKey = "home" | "team" | "new" | "stats" | "account";

export const MY_TEAM_KEY = "cricket-scorer:my-team";
export const LAST_TEAM_KEY = "cricket-scorer:last-team";
export const TEAM_CODES_EVENT = "cricket-scorer:team-codes";

export type TeamCodes = { myTeam: string | null; lastTeam: string | null };

const NO_TAB_BAR = ["/new", "/score", "/team/join", "/auth", "/offline"];

function within(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function tabForPath(pathname: string): TabKey | null {
  if (pathname === "/") return "home";
  if (pathname === "/team") return "team";
  if (within(pathname, "/account")) return "account";
  if (within(pathname, "/t")) return "stats";
  return null;
}

export function showsTabBar(pathname: string): boolean {
  return !NO_TAB_BAR.some((base) => within(pathname, base));
}

function readCode(storage: Pick<Storage, "getItem">, key: string): string | null {
  try {
    const value = storage.getItem(key);
    return value === null || value === "" ? null : value;
  } catch {
    return null;
  }
}

export function readTeamCodes(storage: Pick<Storage, "getItem"> | null): TeamCodes {
  if (storage === null) return { myTeam: null, lastTeam: null };
  return { myTeam: readCode(storage, MY_TEAM_KEY), lastTeam: readCode(storage, LAST_TEAM_KEY) };
}

export function statsHref(codes: TeamCodes): string {
  const code = codes.myTeam ?? codes.lastTeam;
  return code === null ? "/team" : `/t/${code}`;
}

export function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function rememberTeamCode(key: string, code: string | null): void {
  const storage = safeLocalStorage();
  if (storage === null) return;
  try {
    if (code === null) storage.removeItem(key);
    else storage.setItem(key, code);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(TEAM_CODES_EVENT));
}

export function goesBack(referrer: string, origin: string, historyLength: number): boolean {
  if (historyLength < 2 || referrer === "") return false;
  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
}
