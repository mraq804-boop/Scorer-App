import type { CSSProperties } from "react";

type ArtProps = { width: number; height: number; colour?: string; style?: CSSProperties };

const GOLD = "#e2a322";
const PALE_GOLD = "#FAC775";
const NAVY = "#1b2340";
const STEEL = "#5F5E5A";

export function Floodlights({ width, height, colour = PALE_GOLD, style }: ArtProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 400 200" style={style} aria-hidden>
      <path d="M40 30 L-20 200 L130 200 Z" fill={colour} fillOpacity={0.16} />
      <path d="M360 30 L270 200 L420 200 Z" fill={colour} fillOpacity={0.16} />
      <line x1="40" y1="30" x2="40" y2="200" stroke={STEEL} strokeWidth={5} />
      <line x1="360" y1="30" x2="360" y2="200" stroke={STEEL} strokeWidth={5} />
      <rect x="14" y="12" width="52" height="22" rx="4" fill={GOLD} />
      <rect x="334" y="12" width="52" height="22" rx="4" fill={GOLD} />
      <g fill={PALE_GOLD}>
        <circle cx="26" cy="23" r="5" />
        <circle cx="40" cy="23" r="5" />
        <circle cx="54" cy="23" r="5" />
        <circle cx="346" cy="23" r="5" />
        <circle cx="360" cy="23" r="5" />
        <circle cx="374" cy="23" r="5" />
      </g>
    </svg>
  );
}

export function Crowd({ width, height, colour = NAVY, style }: ArtProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 400 60" preserveAspectRatio="none" style={style} aria-hidden>
      <path
        d="M0 30 Q10 14 20 28 Q30 10 42 26 Q52 12 64 28 Q74 8 86 26 Q96 14 108 28 Q118 10 130 26 Q140 12 152 28 Q162 8 174 26 Q184 14 196 28 Q206 10 218 26 Q228 12 240 28 Q250 8 262 26 Q272 14 284 28 Q294 10 306 26 Q316 12 328 28 Q338 8 350 26 Q360 14 372 28 Q382 10 400 26 L400 60 L0 60 Z"
        fill={colour}
      />
    </svg>
  );
}

export function PitchArc({ width, height, colour = "#0F6E56", style }: ArtProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 400 120" preserveAspectRatio="none" style={style} aria-hidden>
      <path d="M0 40 Q200 -10 400 40 L400 120 L0 120 Z" fill={colour} />
      <path d="M0 52 Q200 2 400 52" stroke="#5DCAA5" strokeWidth={3} fill="none" />
    </svg>
  );
}

export function Stumps({ width, height, colour = PALE_GOLD, style }: ArtProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 60 90" style={style} aria-hidden>
      <g stroke={colour} strokeWidth={6} strokeLinecap="round">
        <line x1="12" y1="18" x2="12" y2="86" />
        <line x1="30" y1="18" x2="30" y2="86" />
        <line x1="48" y1="18" x2="48" y2="86" />
      </g>
      <g stroke={colour} strokeWidth={4} strokeLinecap="round">
        <line x1="8" y1="12" x2="29" y2="10" />
        <line x1="31" y1="10" x2="52" y2="12" />
      </g>
    </svg>
  );
}

export function Bat({ width, height, colour = PALE_GOLD, style }: ArtProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 120 40" style={style} aria-hidden>
      <g transform="rotate(-20 60 20)">
        <rect x="6" y="15" width="30" height="10" rx="3" fill="#854F0B" />
        <rect x="34" y="8" width="80" height="24" rx="8" fill={colour} />
      </g>
    </svg>
  );
}

export function Ball({ width, height, colour = "#E24B4A", style }: ArtProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 40 40" style={style} aria-hidden>
      <circle cx="20" cy="20" r="17" fill={colour} />
      <path d="M11 8 Q20 20 11 32 M29 8 Q20 20 29 32" stroke="#FCEBEB" strokeWidth={2} fill="none" />
    </svg>
  );
}

export function Trophy({ width, height, colour = GOLD, style }: ArtProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 60 64" style={style} aria-hidden>
      <path d="M14 6 H46 V22 Q46 40 30 40 Q14 40 14 22 Z" fill={colour} />
      <path d="M14 12 H4 Q4 28 16 28 M46 12 H56 Q56 28 44 28" stroke={colour} strokeWidth={4} fill="none" />
      <rect x="26" y="40" width="8" height="12" fill={colour} />
      <rect x="16" y="52" width="28" height="8" rx="2" fill={colour} />
    </svg>
  );
}

export function Crown({ width, height, colour = GOLD, style }: ArtProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 60 40" style={style} aria-hidden>
      <path d="M4 36 L8 8 L22 22 L30 4 L38 22 L52 8 L56 36 Z" fill={colour} />
    </svg>
  );
}

const CONFETTI: readonly { x: number; y: number; r: number; c: string; w: number; h: number }[] = [
  { x: 30, y: 20, r: 25, c: GOLD, w: 10, h: 20 },
  { x: 90, y: 60, r: -30, c: "#D4537E", w: 8, h: 16 },
  { x: 150, y: 14, r: 60, c: "#5DCAA5", w: 10, h: 18 },
  { x: 210, y: 70, r: 15, c: PALE_GOLD, w: 8, h: 16 },
  { x: 270, y: 24, r: -50, c: "#85B7EB", w: 10, h: 20 },
  { x: 330, y: 64, r: 40, c: GOLD, w: 8, h: 16 },
  { x: 370, y: 18, r: -15, c: "#D4537E", w: 10, h: 18 },
  { x: 60, y: 96, r: 70, c: "#85B7EB", w: 8, h: 14 },
  { x: 250, y: 104, r: -65, c: "#5DCAA5", w: 8, h: 14 },
];

export function ConfettiPieces({ width, height, style }: ArtProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 400 120" style={style} aria-hidden>
      {CONFETTI.map((piece) => (
        <rect
          key={`${piece.x}-${piece.y}`}
          x={piece.x}
          y={piece.y}
          width={piece.w}
          height={piece.h}
          rx={2}
          fill={piece.c}
          transform={`rotate(${piece.r} ${piece.x + piece.w / 2} ${piece.y + piece.h / 2})`}
        />
      ))}
    </svg>
  );
}
