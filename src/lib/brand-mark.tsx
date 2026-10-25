export const INK = "#1b2340";
export const HALDI = "#e2a322";

export function BrandMark({ size, safe = false, rounded = true }: { size: number; safe?: boolean; rounded?: boolean }) {
  const art = Math.round(size * (safe ? 0.56 : 0.72));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: INK,
        borderRadius: rounded && !safe ? Math.round(size * 0.22) : 0,
      }}
    >
      <svg width={art} height={art} viewBox="0 0 100 100" fill="none">
        <rect x="26" y="28" width="10" height="62" rx="3" fill={HALDI} />
        <rect x="45" y="28" width="10" height="62" rx="3" fill={HALDI} />
        <rect x="64" y="28" width="10" height="62" rx="3" fill={HALDI} />
        <rect x="27" y="17" width="22" height="6" rx="3" fill={HALDI} />
        <rect x="51" y="17" width="22" height="6" rx="3" fill={HALDI} />
      </svg>
    </div>
  );
}
