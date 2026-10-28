export const MEDIA_BUCKET = "team-media";

export function logoPath(code: string, version: number): string {
  return `teams/${code}/logo-${version}.jpg`;
}

export function photoPath(code: string, playerId: string, version: number): string {
  return `teams/${code}/players/${playerId}-${version}.jpg`;
}

export function mediaUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

export function logoUrl(code: string, version: number | null | undefined): string | null {
  return typeof version === "number" ? mediaUrl(logoPath(code, version)) : null;
}

export function photoUrl(code: string, playerId: string, version: number | null | undefined): string | null {
  return typeof version === "number" ? mediaUrl(photoPath(code, playerId, version)) : null;
}
