import { initials } from "@/lib/brand";
import type { TeamColour } from "@/lib/brand";
import { cn } from "@/lib/utils";

type AvatarProps = { name: string; url: string | null; size: number; colour: TeamColour; alt?: string; className?: string };

export function Avatar({ name, url, size, colour, alt = "", className }: AvatarProps) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold", className)}
      style={{ width: size, height: size, background: colour.light, color: colour.dark, fontSize: Math.round(size * 0.38) }}
    >
      {url === null ? (
        <span aria-hidden>{initials(name)}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} width={size} height={size} loading="lazy" decoding="async" className="size-full object-cover" />
      )}
    </span>
  );
}
