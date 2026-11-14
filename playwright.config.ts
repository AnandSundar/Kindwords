import { defineConfig, devices } from "@playwright/test";

/**
 * KTD15: F2 end to end against the production build. The web server builds once, then runs the same
 * `start:standalone` path as the Docker image on a fresh data directory, plus a plain host page on a
 * second origin that embeds the wall (tests/e2e/serve.mjs).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:3300", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && node tests/e2e/serve.mjs",
    url: "http://127.0.0.1:3300/api/health",
    timeout: 600_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
