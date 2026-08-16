import type { Decorator, Preview } from "@storybook/web-components-vite";
import { getTheme, setTheme } from "../src/lib/settings.js";
import "./preview.css";

const withTheme: Decorator = (story, context) => {
  const theme = context.globals.theme === "light" ? "light" : "dark";
  if (getTheme() !== theme) setTheme(theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  return story();
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "Chatworks color scheme",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "dark",
  },
  parameters: {
    layout: "fullscreen",
    a11y: {
      test: "error",
    },
    controls: {
      expanded: true,
      sort: "requiredFirst",
    },
    options: {
      storySort: {
        order: ["Introduction", "AI surfaces", "Workflows", "Data display", "Inputs", "Feedback"],
      },
    },
  },
  tags: ["autodocs"],
};

export default preview;
