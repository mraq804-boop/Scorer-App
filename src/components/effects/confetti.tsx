"use client";

import { useEffect, useRef, useState } from "react";
import { browserEffectsEnabled } from "./motion";

const PIECES = 24;
const LIFETIME_MS = 2200;

type Piece = { left: number; delay: number; spin: number; colour: string };

function piecesFor(colours: readonly string[]): Piece[] {
  return Array.from({ length: PIECES }, (_, index) => ({
    left: (index * 37) % 100,
    delay: (index % 6) * 90,
    spin: ((index * 53) % 360) - 180,
    colour: colours[index % colours.length] ?? "#e2a322",
  }));
}

export function Confetti({ colours }: { colours: readonly string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    const element = ref.current;
    if (element === null || !browserEffectsEnabled() || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setPieces(piecesFor(colours));
      timer = setTimeout(() => setPieces([]), LIFETIME_MS);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [colours]);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="confetti">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="confetti-piece"
          style={{
            insetInlineStart: `${piece.left}%`,
            background: piece.colour,
            animationDelay: `${piece.delay}ms`,
            ["--spin" as string]: `${piece.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
