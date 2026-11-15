import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { GcMessageList } from "@jpahd/chatworks/message-list";
import { MessageRole, type Turn } from "@jpahd/chatworks/chat-types";

void GcMessageList;

const completedTurns: Turn[] = [
  {
    id: "user-workflow",
    role: MessageRole.USER,
    content: "Plan the first planting weekend for a small community garden.",
    attachments: [
      {
        filename: "garden-notes.md",
        mimeType: "text/markdown",
        size: 1_842,
        data: new Uint8Array(),
      },
    ],
  },
  {
    id: "assistant-workflow",
    role: MessageRole.ASSISTANT,
    content: "Start with soil preparation, planting, and a volunteer watering rota.",
    html: `<p>Start with <strong>soil preparation</strong>, planting, and a volunteer watering rota.</p>
<ul><li>Prepare the north bed.</li><li>Plant leafy greens.</li><li>Record the dates in <code>garden-plan.md</code>.</li></ul>`,
    model: "claude-sonnet-4",
    tokensIn: 1_284,
    tokensOut: 412,
    thinking: "Check the planting season before suggesting crops.",
    tools: [
      {
        id: "read-contract",
        name: "read",
        argsJson: '{"path":"docs/garden-plan.md"}',
        state: "done",
        content: "Loaded 148 lines",
        expanded: true,
      },
      {
        id: "check-types",
        name: "bash",
        argsJson: '{"season":"spring"}',
        state: "done",
        content: "Planting dates checked",
      },
    ],
  },
];

const meta = {
  title: "Chat/Message list",
  component: "cw-message-list",
  parameters: {
    docs: {
      description: {
        component:
          "Ordered user and assistant turns with markdown, thinking, tool activity, attachments, token metadata, retry, edit, copy, and streaming states.",
      },
    },
  },
  args: {
    turns: completedTurns,
    sending: false,
  },
  render: (args: { turns: Turn[]; sending: boolean }) => html`
    <div class="story-frame constrained">
      <div class="story-panel" style="height: 720px; display: flex">
        <cw-message-list
          .turns=${args.turns}
          .sending=${args.sending}
          style="display: flex; flex: 1; min-height: 0"
        ></cw-message-list>
      </div>
    </div>
  `,
} satisfies Meta<{ turns: Turn[]; sending: boolean }>;

export default meta;
type Story = StoryObj<{ turns: Turn[]; sending: boolean }>;

export const Completed: Story = {};

export const Streaming: Story = {
  args: {
    sending: true,
    turns: [
      ...completedTurns.slice(0, 1),
      {
        id: "assistant-streaming",
        role: MessageRole.ASSISTANT,
        content: "I’ll group the planting tasks by bed, then assign volunteer duties",
        model: "qwen3-coder",
        streaming: true,
        thinking: "Reviewing the seasonal planting dates…",
        tools: [
          {
            id: "inspect",
            name: "inspect_workflow",
            argsJson: '{"plan":"spring","scope":"garden"}',
            state: "running",
            expanded: true,
          },
        ],
      },
    ],
  },
};

export const FailedTurn: Story = {
  args: {
    turns: [
      {
        id: "user-failed",
        role: MessageRole.USER,
        content: "Draft the planting rota.",
      },
      {
        id: "assistant-failed",
        role: MessageRole.ASSISTANT,
        content: "The assistant connection closed before the rota could be generated.",
        error: "Connection closed",
        model: "remote-model",
        tools: [
          {
            id: "board-write",
            name: "write_board",
            argsJson: '{"project":"community-garden"}',
            state: "error",
            content: "Connection closed",
            expanded: true,
          },
        ],
      },
    ],
  },
};
