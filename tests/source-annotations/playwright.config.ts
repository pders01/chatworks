import { defineConfig } from "playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: ".",
  testMatch: ["*.spec.ts", "*.e2e.ts"],
  outputDir: "./test-results",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5198", trace: "retain-on-failure" },
  projects: [
    { name: "wide", use: { browserName: "chromium", viewport: { width: 1280, height: 1100 } } },
    // The standalone review matrix already covers both widths; do not duplicate it.
    {
      name: "narrow",
      testIgnore: "panel.spec.ts",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    command: "node_modules/.bin/vite --config examples/source-annotations/vite.config.ts",
    url: "http://127.0.0.1:5198",
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
