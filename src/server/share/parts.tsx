import type { CSSProperties } from "react";
import { BrandMark, HALDI, INK } from "@/lib/brand-mark";
import { t } from "@/lib/i18n";
import { NASKH, SANS } from "./fonts";

export { HALDI, INK };
export const PAPER = "#f6f7fb";
export const SLATE = "#5f6b85";
export const SINDOOR = "#c2413b";
export const WHITE = "#ffffff";
export const FONT_FAMILY = `${SANS}, ${NASKH}`;

type ClipProps = { size: number; weight?: 400 | 700; color?: string; align?: "left" | "center"; children: string };

export function Clip({ size, weight = 400, color, align = "left", children }: ClipProps) {
  const style: CSSProperties = {
    display: "block",
    flexGrow: align === "center" ? 0 : 1,
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: size,
    fontWeight: weight,
    color,
    textAlign: align,
  };
  return <div style={style}>{children}</div>;
}

export function Brand({ size, color }: { size: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.3) }}>
      <BrandMark size={size} />
      <div style={{ display: "flex", fontSize: Math.round(size * 0.46), fontWeight: 700, color }}>{t("app.name")}</div>
    </div>
  );
}

export function LiveBadge({ size }: { size: number }) {
  const dot = Math.round(size * 0.4);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(size * 0.3),
        padding: `${Math.round(size * 0.18)}px ${Math.round(size * 0.45)}px`,
        borderRadius: size,
        background: SINDOOR,
        color: WHITE,
        fontSize: size,
        fontWeight: 700,
      }}
    >
      <div style={{ display: "flex", width: dot, height: dot, borderRadius: size, background: WHITE }} />
      <div style={{ display: "flex" }}>{t("share.liveBadge")}</div>
    </div>
  );
}
