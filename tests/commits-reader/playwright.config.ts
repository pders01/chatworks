import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "./test-results",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5197", trace: "retain-on-failure" },
  projects: [
    { name: "wide", use: { browserName: "chromium", viewport: { width: 1280, height: 1100 } } },
    {
      name: "narrow",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    command: "node_modules/.bin/vite --config examples/commits-reader/vite.config.ts",
    url: "http://127.0.0.1:5197",
    reuseExistingServer: false,
    timeout: 30000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
