import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src",
  testMatch: "**/*.spec.ts",
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.CONSOLE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm --filter @leash/console dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120000,
      },
});

