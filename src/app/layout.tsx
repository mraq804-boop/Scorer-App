import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TabBar } from "@/components/app/tab-bar";
import { t } from "@/lib/i18n";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: t("app.name"), template: `%s · ${t("app.name")}` },
  description: t("home.tagline"),
  applicationName: t("app.name"),
  appleWebApp: { capable: true, title: t("app.name"), statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1b2340" },
    { media: "(prefers-color-scheme: dark)", color: "#1b2340" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${figtree.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <TabBar />
          <Toaster richColors position="top-center" theme="system" />
        </ThemeProvider>
      </body>
    </html>
  );
}
