import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { CwChatTurn } from "../src/components/chat-turn.js";
import { MessageRole, type Turn } from "../src/lib/chat-types.js";

void CwChatTurn;

const assistantTurn: Turn = {
  id: "assistant-boundary",
  role: MessageRole.ASSISTANT,
  content:
    "The turn owns display composition while the message list retains ordering and interaction policy.",
  html: `<p>The turn owns <strong>display composition</strong> while the message list retains ordering and interaction policy.</p>
<ul><li>Attachments, thinking, and tools stay transport-free.</li><li>Actions and editors are caller-owned slots.</li></ul>`,
  model: "claude-sonnet-4",
  tokensIn: 1_284,
  tokensOut: 412,
  thinking: "Keep wrapper-specific action eligibility out of the primitive API.",
  tools: [
    {
      id: "check-boundary",
      name: "bash",
      argsJson: '{"command":"bun run check"}',
      state: "done",
      content: "Typecheck passed",
    },
  ],
};

const meta = {
  title: "AI surfaces/Chat turn",
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
      content: "Review the proposed turn boundary.",
      attachments: [
        {
          filename: "turn-notes.md",
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
      content: "Extracting the display composition",
      html: undefined,
      streaming: true,
      thinking: "Reviewing ownership boundaries…",
      tools: [
        {
          id: "inspect-turn",
          name: "inspect",
          argsJson: '{"component":"cw-message-list"}',
          state: "running",
        },
      ],
    },
  },
};
