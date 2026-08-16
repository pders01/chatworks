import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { LitElement, css, html } from "lit";
import { property } from "lit/decorators.js";
import { GcToast } from "../src/components/toast.js";

void GcToast;

type ToastKind = "info" | "success" | "warn" | "error";

class StoryToastFixture extends LitElement {
  @property() kind: ToastKind = "success";
  @property() message = "Extension activated";

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
      <div class="story-frame constrained">
        <button class="story-button trigger" @click=${this.notify}>
          Show ${this.kind} notification
        </button>
        <cw-toast></cw-toast>
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      color: var(--text);
      background: var(--surface-0);
      font-family: var(--font-sans);
    }
    .story-frame {
      display: grid;
      min-height: 100vh;
      place-items: start center;
      padding: 3rem;
    }
    button {
      padding: 0.55rem 0.8rem;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      color: var(--text);
      background: var(--surface-2);
      font: 500 var(--text-sm) var(--font-sans);
      cursor: pointer;
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
  title: "Feedback/Toast",
  component: "cw-toast",
  args: {
    kind: "success",
    message: "Project-board extension activated",
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
  args: { kind: "warn", message: "This extension can access the active workspace" },
};

export const Error: Story = {
  args: { kind: "error", message: "The canvas extension could not be loaded" },
};
