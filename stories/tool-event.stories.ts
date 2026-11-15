import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { CwToolEvent } from "@jpahd/chatworks/tool-event";
import type { ToolEvent } from "@jpahd/chatworks/chat-types";

void CwToolEvent;

const completed: ToolEvent = {
  id: "read-contract",
  name: "read",
  argsJson: '{"path":"docs/garden-plan.md"}',
  state: "done",
  content: "Loaded 148 lines",
};

type ToolEventArgs = {
  toolEvent: ToolEvent;
};

const meta = {
  title: "Chat/Tool event",
  component: "cw-tool-event",
  parameters: {
    docs: {
      description: {
        component:
          "Transport-free summary and caller-owned disclosure for one agentic tool invocation.",
      },
    },
  },
  args: {
    toolEvent: completed,
  },
  render: (args: ToolEventArgs) => html`
    <div class="story-frame constrained centered">
      <div class="story-panel" role="list" aria-label="Tool activity" style="width: 100%">
        <cw-tool-event .toolEvent=${args.toolEvent}></cw-tool-event>
      </div>
    </div>
  `,
} satisfies Meta<ToolEventArgs>;

export default meta;
type Story = StoryObj<ToolEventArgs>;

export const Completed: Story = {};

export const Expanded: Story = {
  args: {
    toolEvent: { ...completed, expanded: true },
  },
};

export const Running: Story = {
  args: {
    toolEvent: {
      id: "inspect-workflow",
      name: "inspect_workflow",
      argsJson: '{"season":"spring","scope":"garden"}',
      state: "running",
    },
  },
};

export const Failed: Story = {
  args: {
    toolEvent: {
      id: "write-board",
      name: "write_board",
      argsJson: '{"project":"community-garden"}',
      state: "error",
      content: "Connection closed",
      expanded: true,
    },
  },
};
