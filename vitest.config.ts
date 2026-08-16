import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const storybookProject = (
  name: string,
  theme: "dark" | "light",
  viewport: { width: number; height: number },
) => ({
  extends: true as const,
  plugins: [
    storybookTest({
      configDir: path.join(dirname, ".storybook"),
      initialGlobals: { theme },
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
  test: {
    projects: [
      storybookProject("storybook-desktop-dark", "dark", { width: 1440, height: 900 }),
      storybookProject("storybook-desktop-light", "light", { width: 1440, height: 900 }),
      storybookProject("storybook-mobile-dark", "dark", { width: 390, height: 844 }),
    ],
  },
});
