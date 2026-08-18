import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { CwToolEvent } from "../src/components/tool-event.js";
import type { ToolEvent } from "../src/lib/chat-types.js";

void CwToolEvent;

const completed: ToolEvent = {
  id: "read-contract",
  name: "read",
  argsJson: '{"path":"docs/workbench.md"}',
  state: "done",
  content: "Loaded 148 lines",
};

type ToolEventArgs = {
  toolEvent: ToolEvent;
};

const meta = {
  title: "AI surfaces/Tool event",
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
      argsJson: '{"surface":"board","scope":"project"}',
      state: "running",
    },
  },
};

export const Failed: Story = {
  args: {
    toolEvent: {
      id: "write-board",
      name: "write_board",
      argsJson: '{"project":"chatworks"}',
      state: "error",
      content: "Connection closed",
      expanded: true,
    },
  },
};
