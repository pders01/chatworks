import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { GcChatView } from "../src/components/chat-view.js";
import {
  createStoryChatHost,
  createStoryLlmConfigHost,
  createStoryRepoHost,
} from "./support/story-host.js";
import "./support/story-host.js";

void GcChatView;

type ChatArgs = {
  repoId: string;
  composerPlaceholder: string;
};

const meta = {
  title: "AI surfaces/Chat view",
  component: "cw-chat-view",
  parameters: {
    docs: {
      description: {
        component:
          "Complete chat composition over injected host interfaces. Send a message in the canvas to exercise thinking, tool calls, token streaming, and session creation.",
      },
    },
  },
  args: {
    repoId: "storybook",
    composerPlaceholder: "Ask the assistant to compose a workflow…",
  },
  render: (args: ChatArgs) => html`
    <cw-story-host
      .chatHost=${createStoryChatHost({ sessions: [] })}
      .repoHost=${createStoryRepoHost()}
      .llmConfigHost=${createStoryLlmConfigHost()}
    >
      <div style="height: 820px; display: flex; overflow: hidden">
        <cw-chat-view
          .repoId=${args.repoId}
          .composerPlaceholder=${args.composerPlaceholder}
        ></cw-chat-view>
      </div>
    </cw-story-host>
  `,
} satisfies Meta<ChatArgs>;

export default meta;
type Story = StoryObj<ChatArgs>;

export const Interactive: Story = {};

export const Standalone: Story = {
  args: {
    repoId: "",
    composerPlaceholder: "Ask anything…",
  },
};
