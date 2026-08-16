import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { GcSettingsPanel } from "../src/components/settings-panel.js";
import { createStoryLlmConfigHost } from "./support/story-host.js";
import "./support/story-host.js";

void GcSettingsPanel;

type SettingsArgs = {
  open: boolean;
  configKeyPrefix: string;
};

const meta = {
  title: "AI surfaces/Settings panel",
  component: "cw-settings-panel",
  parameters: {
    docs: {
      description: {
        component:
          "Runtime appearance, provider configuration, model discovery, and reusable LLM profiles over an injected configuration host.",
      },
    },
  },
  args: {
    open: true,
    configKeyPrefix: "",
  },
  render: (args: SettingsArgs) => html`
    <cw-story-host .llmConfigHost=${createStoryLlmConfigHost()}>
      <div class="story-frame">
        <cw-settings-panel
          .open=${args.open}
          .configKeyPrefix=${args.configKeyPrefix}
        ></cw-settings-panel>
      </div>
    </cw-story-host>
  `,
} satisfies Meta<SettingsArgs>;

export default meta;
type Story = StoryObj<SettingsArgs>;

export const Open: Story = {};
