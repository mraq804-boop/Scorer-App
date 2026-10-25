import type { MetadataRoute } from "next";
import { t } from "@/lib/i18n";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: t("app.name"),
    short_name: t("app.name"),
    description: t("home.tagline"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7fb",
    theme_color: "#1b2340",
    categories: ["sports", "utilities"],
    lang: "en",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: t("home.newMatch"), url: "/new", icons: [{ src: "/icons/192", sizes: "192x192" }] }],
  };
}
