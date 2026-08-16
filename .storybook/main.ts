import type { StorybookConfig } from "@storybook/web-components-vite";

const config: StorybookConfig = {
  stories: ["../stories/**/*.mdx", "../stories/**/*.stories.ts"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "storybook/viewport"],
  framework: {
    name: "@storybook/web-components-vite",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
  viteFinal(config) {
    const dedupe = new Set([
      ...(config.resolve?.dedupe ?? []),
      "lit",
      "lit-element",
      "lit-html",
      "@lit/reactive-element",
    ]);
    const include = new Set([
      ...(config.optimizeDeps?.include ?? []),
      "lit",
      "lit/directive-helpers.js",
      "lit-html",
      "lit-html/directive-helpers.js",
    ]);
    return {
      ...config,
      resolve: { ...config.resolve, dedupe: [...dedupe] },
      optimizeDeps: { ...config.optimizeDeps, include: [...include] },
    };
  },
};

export default config;
