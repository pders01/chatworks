import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { LitElement, css, html } from "lit";
import { property } from "lit/decorators.js";
import { GcToast } from "@jpahd/chatworks/toast";

void GcToast;

type ToastKind = "info" | "success" | "warn" | "error";

class StoryToastFixture extends LitElement {
  @property() kind: ToastKind = "success";
  @property() message = "Garden plan saved";

  protected override firstUpdated(): void {
    this.notify();
  }

  private notify(): void {
    const source = this.renderRoot.querySelector(".trigger") ?? this;
    source.dispatchEvent(
      new CustomEvent("gc:toast", {
        detail: { kind: this.kind, message: this.message },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div class="story-frame">
        <section class="panel">
          <span class="eyebrow">notification center</span>
          <h1>${this.kind} feedback</h1>
          <p>Toasts remain visible without blocking the workflow beneath them.</p>
          <button class="trigger" @click=${this.notify}>Show ${this.kind} notification</button>
        </section>
        <cw-toast></cw-toast>
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: block;
      color: CanvasText;
      background: Canvas;
      font: 1rem/1.5 system-ui;
    }
    .story-frame {
      box-sizing: border-box;
      display: grid;
      min-block-size: 100vh;
      place-items: center;
      padding: 1rem;
    }
    .panel {
      box-sizing: border-box;
      inline-size: min(100%, 460px);
      padding: 1.5rem;
      border: 1px solid GrayText;
      border-radius: 0.5rem;
    }
    h1 {
      margin-block: 0.5rem;
      font-size: 1.5rem;
    }
    p {
      margin-block: 0 1rem;
    }
    button {
      min-block-size: 2rem;
      font: inherit;
    }
  `;
}

if (!customElements.get("cw-story-toast-fixture")) {
  customElements.define("cw-story-toast-fixture", StoryToastFixture);
}

type ToastArgs = {
  kind: ToastKind;
  message: string;
};

const meta = {
  title: "Primitives/Toast",
  component: "cw-toast",
  args: {
    kind: "success",
    message: "Garden plan saved",
  },
  argTypes: {
    kind: { control: "inline-radio", options: ["info", "success", "warn", "error"] },
  },
  render: (args: ToastArgs) => html`
    <cw-story-toast-fixture .kind=${args.kind} .message=${args.message}></cw-story-toast-fixture>
  `,
} satisfies Meta<ToastArgs>;

export default meta;
type Story = StoryObj<ToastArgs>;

export const Success: Story = {};

export const Information: Story = {
  args: { kind: "info", message: "Workspace context refreshed" },
};

export const Warning: Story = {
  args: { kind: "warn", message: "The planting schedule has unsaved changes" },
};

export const Error: Story = {
  args: { kind: "error", message: "The planting schedule could not be saved" },
};
