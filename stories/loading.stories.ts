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
    <div class="story-frame constrained">
      <div class="story-panel">
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
    <div class="story-frame">
      <div style="display:flex; align-items:center; gap:2rem">
        <span><cw-spinner size="sm"></cw-spinner> small</span>
        <span><cw-spinner size="lg"></cw-spinner> large</span>
      </div>
    </div>
  `,
};
