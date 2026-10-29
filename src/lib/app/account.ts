function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function displayName(metadata: Record<string, unknown> | undefined): string | null {
  if (metadata === undefined) return null;
  return text(metadata.full_name) ?? text(metadata.name);
}
