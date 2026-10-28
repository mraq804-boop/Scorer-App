"use client";

import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/brand";
import type { TeamColour } from "@/lib/brand";
import { cn } from "@/lib/utils";

type AvatarProps = { name: string; url: string | null; size: number; colour: TeamColour; alt?: string; className?: string };

type LoadState = { complete: boolean; naturalWidth: number; currentSrc: string };

export function imageFailed(image: LoadState): boolean {
  return image.complete && image.naturalWidth === 0 && image.currentSrc !== "";
}

export function Avatar({ name, url, size, colour, alt = "", className }: AvatarProps) {
  const image = useRef<HTMLImageElement>(null);
  const [broken, setBroken] = useState<string | null>(null);

  useEffect(() => {
    const element = image.current;
    if (element !== null && url !== null && imageFailed(element)) setBroken(url);
  }, [url]);

  const showImage = url !== null && broken !== url;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold", className)}
      style={{ width: size, height: size, background: colour.light, color: colour.dark, fontSize: Math.round(size * 0.38) }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={image}
          src={url}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(url)}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
