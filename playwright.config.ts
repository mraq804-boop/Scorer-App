import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.E2E_BASE_URL;
const baseURL = externalBaseURL ?? "http://localhost:3200";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL, trace: "retain-on-failure" },
  webServer:
    externalBaseURL === undefined
      ? {
          command: "npx next start -p 3200",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          env: {
            NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder_build_only",
            NEXT_PUBLIC_SITE_URL: "http://localhost:3200",
          },
        }
      : undefined,
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel: process.env.E2E_CHANNEL ?? "msedge", viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: process.env.E2E_CHANNEL ?? "msedge" } },
  ],
});
