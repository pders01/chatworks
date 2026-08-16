import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { GcSessionSidebar } from "../src/components/chat-view/session-sidebar.js";
import { createStoryChatHost, storySessions } from "./support/story-host.js";
import "./support/story-host.js";

void GcSessionSidebar;

type SidebarArgs = {
  selected: string;
  empty: boolean;
};

const meta = {
  title: "AI surfaces/Session sidebar",
  component: "cw-session-sidebar",
  args: {
    selected: "session-design",
    empty: false,
  },
  render: (args: SidebarArgs) => html`
    <cw-story-host .chatHost=${createStoryChatHost()}>
      <div class="story-frame constrained">
        <div class="story-panel" style="width: 300px; height: 680px; display:flex">
          <cw-session-sidebar
            .sessions=${args.empty ? [] : storySessions}
            .selected=${args.selected}
            repo-id="storybook"
            style="display:flex; flex:1; flex-direction:column; min-height:0"
          ></cw-session-sidebar>
        </div>
      </div>
    </cw-story-host>
  `,
} satisfies Meta<SidebarArgs>;

export default meta;
type Story = StoryObj<SidebarArgs>;

export const Populated: Story = {};

export const Empty: Story = {
  args: { empty: true, selected: "" },
};
