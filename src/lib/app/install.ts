export const INSTALL_DISMISSED_KEY = "cricket-scorer:install-dismissed";
export const DISMISS_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export function installCardVisible(dismissedAt: number | null, now: number): boolean {
  return dismissedAt === null || now - dismissedAt >= DISMISS_DAYS * DAY_MS;
}

export function readDismissedAt(storage: Pick<Storage, "getItem"> | null): number | null {
  if (storage === null) return null;
  try {
    const value = Number(storage.getItem(INSTALL_DISMISSED_KEY) ?? Number.NaN);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
