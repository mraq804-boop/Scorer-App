export const DEFAULT_SITE_URL = "http://localhost:3200";

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

export function matchUrl(code: string): string {
  return `${siteUrl()}/m/${code}`;
}

export function teamUrl(code: string): string {
  return `${siteUrl()}/t/${code}`;
}

export function inviteUrl(token: string): string {
  return `${siteUrl()}/team/join?token=${encodeURIComponent(token)}`;
}
