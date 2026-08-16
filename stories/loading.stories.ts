import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { GcLoadingBanner, GcSpinner } from "../src/components/loading-indicator.js";

void GcLoadingBanner;
void GcSpinner;

type LoadingArgs = {
  heading: string;
  detail: string;
};

const meta = {
  title: "Feedback/Loading",
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
      <div class="story-panel" style="width:min(100%, 460px); padding:var(--space-5)">
        <p class="story-label">inline progress</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3)">
          <div class="spinner-sample"><cw-spinner size="sm"></cw-spinner><span>compact</span></div>
          <div class="spinner-sample"><cw-spinner size="lg"></cw-spinner><span>banner</span></div>
        </div>
      </div>
    </div>
  `,
};
