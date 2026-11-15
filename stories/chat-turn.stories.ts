import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { CwChatTurn } from "@jpahd/chatworks/chat-turn";
import { MessageRole, type Turn } from "@jpahd/chatworks/chat-types";

void CwChatTurn;

const assistantTurn: Turn = {
  id: "assistant-boundary",
  role: MessageRole.ASSISTANT,
  content: "Plant leafy greens first, then herbs once the weather warms up.",
  html: `<p>Plant <strong>leafy greens</strong> first, then herbs once the weather warms up.</p>
<ul><li>Water seedlings in the morning.</li><li>Rotate volunteer duties each week.</li></ul>`,
  model: "claude-sonnet-4",
  tokensIn: 1_284,
  tokensOut: 412,
  thinking: "Match each crop to its planting season.",
  tools: [
    {
      id: "check-boundary",
      name: "bash",
      argsJson: '{"path":"garden-plan.md"}',
      state: "done",
      content: "Checked the synthetic planting schedule",
    },
  ],
};

const meta = {
  title: "Chat/Turn",
  component: "cw-chat-turn",
  parameters: {
    docs: {
      description: {
        component:
          "One transport-free chat turn with caller-owned action/body slots and nested attachment, thinking, and tool primitives.",
      },
    },
  },
  args: {
    turn: assistantTurn,
  },
  render: (args: { turn: Turn }) => html`
    <div class="story-frame constrained centered">
      <div class="story-panel" style="width: 100%">
        <cw-chat-turn .turn=${args.turn}></cw-chat-turn>
      </div>
    </div>
  `,
} satisfies Meta<{ turn: Turn }>;

export default meta;
type Story = StoryObj<{ turn: Turn }>;

export const Assistant: Story = {};

export const User: Story = {
  args: {
    turn: {
      id: "user-boundary",
      role: MessageRole.USER,
      content: "Review the proposed planting schedule.",
      attachments: [
        {
          filename: "planting-notes.md",
          mimeType: "text/markdown",
          size: 2_048,
          data: new Uint8Array(),
        },
      ],
    },
  },
};

export const WithCallerActions: Story = {
  render: (args) => html`
    <div class="story-frame constrained centered">
      <div class="story-panel" style="width: 100%">
        <cw-chat-turn .turn=${args.turn}>
          <button slot="actions" type="button">copy</button>
          <button slot="actions" type="button">regenerate</button>
        </cw-chat-turn>
      </div>
    </div>
  `,
};

export const Streaming: Story = {
  args: {
    turn: {
      ...assistantTurn,
      id: "assistant-streaming-turn",
      content: "Grouping the crops by planting season",
      html: undefined,
      streaming: true,
      thinking: "Reviewing the planting notes…",
      tools: [
        {
          id: "inspect-turn",
          name: "inspect",
          argsJson: '{"crop":"lettuce"}',
          state: "running",
        },
      ],
    },
  },
};
