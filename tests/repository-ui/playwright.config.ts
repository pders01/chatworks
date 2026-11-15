import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "./test-results",
  use: { baseURL: "http://127.0.0.1:5199", headless: true },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --config examples/repository-ui/vite.config.ts",
    cwd: new URL("../..", import.meta.url).pathname,
    url: "http://127.0.0.1:5199/examples/repository-ui/",
    reuseExistingServer: false,
    timeout: 20000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
