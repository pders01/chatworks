import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { CwThinkingDisclosure } from "@jpahd/chatworks/thinking-disclosure";

void CwThinkingDisclosure;

type ThinkingDisclosureArgs = {
  thinking: string;
  expanded: boolean;
  streaming: boolean;
};

const meta = {
  title: "Chat/Thinking disclosure",
  component: "cw-thinking-disclosure",
  parameters: {
    docs: {
      description: {
        component:
          "Transport-free native disclosure for assistant reasoning or in-progress thinking text.",
      },
    },
  },
  args: {
    thinking:
      "Check the last frost date, group crops by season, and leave time for soil preparation before assigning the planting tasks.",
    expanded: false,
    streaming: false,
  },
  render: (args: ThinkingDisclosureArgs) => html`
    <div class="story-frame constrained centered">
      <div class="story-panel" style="width: 100%">
        <cw-thinking-disclosure
          .thinking=${args.thinking}
          .expanded=${args.expanded}
          .streaming=${args.streaming}
        ></cw-thinking-disclosure>
      </div>
    </div>
  `,
} satisfies Meta<ThinkingDisclosureArgs>;

export default meta;
type Story = StoryObj<ThinkingDisclosureArgs>;

export const Collapsed: Story = {};

export const Expanded: Story = {
  args: { expanded: true },
};

export const Streaming: Story = {
  args: {
    thinking: "Reviewing the seasonal planting dates…",
    streaming: true,
  },
};
