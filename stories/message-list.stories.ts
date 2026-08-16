import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { GcMessageList } from "../src/components/chat-view/message-list.js";
import { MessageRole, type Turn } from "../src/lib/chat-types.js";

void GcMessageList;

const completedTurns: Turn[] = [
  {
    id: "user-workflow",
    role: MessageRole.USER,
    content: "Create an extension point for project workflows and show how a board would use it.",
    attachments: [
      {
        filename: "workflow-notes.md",
        mimeType: "text/markdown",
        size: 1_842,
        data: new Uint8Array(),
      },
    ],
  },
  {
    id: "assistant-workflow",
    role: MessageRole.ASSISTANT,
    content:
      "The workbench should own lifecycle and navigation while the extension owns its domain UI.",
    html: `<p>The workbench should own <strong>lifecycle and navigation</strong> while the extension owns its domain UI.</p>
<ul><li>Register a full primary view.</li><li>Resolve host capabilities through services.</li><li>Return cleanup from <code>mount()</code>.</li></ul>`,
    model: "claude-sonnet-4",
    tokensIn: 1_284,
    tokensOut: 412,
    thinking:
      "I should avoid defining a board model in the generic library and focus on composition seams.",
    tools: [
      {
        id: "read-contract",
        name: "read",
        argsJson: '{"path":"docs/workbench.md"}',
        state: "done",
        content: "Loaded 148 lines",
        expanded: true,
      },
      {
        id: "check-types",
        name: "bash",
        argsJson: '{"command":"bun run check"}',
        state: "done",
        content: "Typecheck passed",
      },
    ],
  },
];

const meta = {
  title: "AI surfaces/Message list",
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
        content: "I’ll map the board’s columns to a project service, then expose assistant actions",
        model: "qwen3-coder",
        streaming: true,
        thinking: "Reviewing the current extension points…",
        tools: [
          {
            id: "inspect",
            name: "inspect_workflow",
            argsJson: '{"surface":"board","scope":"project"}',
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
        content: "Generate the release board.",
      },
      {
        id: "assistant-failed",
        role: MessageRole.ASSISTANT,
        content: "The assistant connection closed before the board could be generated.",
        error: "Connection closed",
        model: "remote-model",
        tools: [
          {
            id: "board-write",
            name: "write_board",
            argsJson: '{"project":"chatworks"}',
            state: "error",
            content: "Connection closed",
            expanded: true,
          },
        ],
      },
    ],
  },
};
