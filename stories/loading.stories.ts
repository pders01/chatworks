import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { GcLoadingBanner, GcSpinner } from "@jpahd/chatworks/loading-indicator";

void GcLoadingBanner;
void GcSpinner;

type LoadingArgs = {
  heading: string;
  detail: string;
};

const meta = {
  title: "Primitives/Loading",
  component: "cw-loading-banner",
  args: {
    heading: "assembling project context…",
    detail: "Reading workspace metadata and extension contributions",
  },
  render: (args: LoadingArgs) => html`
    <div class="story-frame constrained centered">
      <div class="story-panel" style="width:min(100%, 620px)">
        <cw-loading-banner .heading=${args.heading} .detail=${args.detail}></cw-loading-banner>
      </div>
    </div>
  `,
} satisfies Meta<LoadingArgs>;

export default meta;
type Story = StoryObj<LoadingArgs>;

export const Banner: Story = {};

export const SpinnerSizes: Story = {
  render: () => html`
    <div class="story-frame constrained centered">
      <div class="story-panel" style="width:min(100%, 460px); padding:1.5rem">
        <p class="story-label">inline progress</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:.75rem">
          <div class="spinner-sample"><cw-spinner size="sm"></cw-spinner><span>compact</span></div>
          <div class="spinner-sample"><cw-spinner size="lg"></cw-spinner><span>banner</span></div>
        </div>
      </div>
    </div>
  `,
};
