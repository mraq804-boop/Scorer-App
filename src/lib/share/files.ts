const REVOKE_DELAY_MS = 1000;

export function wasCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function download(file: File): void {
  const href = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = href;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), REVOKE_DELAY_MS);
}
