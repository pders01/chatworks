import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const storybookProject = (
  name: string,
  colorScheme: "dark" | "light",
  viewport: { width: number; height: number },
) => ({
  extends: true as const,
  // Each browser project optimizes public ESM independently; never share writes.
  cacheDir: path.join(dirname, "node_modules/.cache/vite", name),
  plugins: [
    storybookTest({
      configDir: path.join(dirname, ".storybook"),
      initialGlobals: { colorScheme },
    }),
  ],
  test: {
    name,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: "chromium" as const, viewport }],
    },
  },
});

export default defineConfig({
  envDir: false,
  optimizeDeps: { include: ["lit/directives/style-map.js"] },
  test: {
    projects: [
      storybookProject("storybook-desktop-dark", "dark", { width: 1440, height: 900 }),
      storybookProject("storybook-desktop-light", "light", { width: 1440, height: 900 }),
      storybookProject("storybook-mobile-dark", "dark", { width: 390, height: 844 }),
    ],
  },
});
