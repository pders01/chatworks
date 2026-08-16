import type { Decorator, Preview } from "@storybook/web-components-vite";
import "./preview.css";

const withTheme: Decorator = (story, context) => {
  const colorScheme = context.globals.colorScheme === "light" ? "light" : "dark";
  document.documentElement.dataset.colorScheme = colorScheme;
  document.documentElement.style.colorScheme = colorScheme;
  return story();
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    colorScheme: {
      description: "Preview color scheme",
      toolbar: {
        icon: "contrast",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    colorScheme: "dark",
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
