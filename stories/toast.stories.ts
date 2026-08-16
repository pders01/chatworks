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
      min-height: 100vh;
      color: var(--text);
      background: var(--surface-0);
      font-family: var(--font-sans);
    }
    .story-frame {
      box-sizing: border-box;
      display: grid;
      min-height: 100vh;
      place-items: center;
      padding: clamp(1rem, 4vw, 3rem);
    }
    .panel {
      box-sizing: border-box;
      width: min(100%, 460px);
      padding: clamp(1.25rem, 4vw, 2rem);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      background: var(--surface-1);
      box-shadow: var(--shadow-dropdown);
    }
    .eyebrow {
      color: var(--text-muted);
      font: var(--text-xs) var(--font-mono);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0.45rem 0;
      font-size: clamp(1.2rem, 4vw, 1.65rem);
    }
    p {
      margin: 0 0 1.25rem;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: 1.5;
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
