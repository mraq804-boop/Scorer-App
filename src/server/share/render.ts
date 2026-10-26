import "server-only";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import { loadImageFonts } from "./fonts";

export type ImageSize = { width: number; height: number };

export async function renderPng(element: ReactElement, size: ImageSize, cacheControl: string): Promise<Response> {
  return new ImageResponse(element, { ...size, fonts: await loadImageFonts(), headers: { "cache-control": cacheControl } });
}

export function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}
