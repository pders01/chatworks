import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { LitElement, css, html } from "lit";
import { property } from "lit/decorators.js";
import { GcComposer } from "../src/components/chat-view/composer.js";
import { createStoryLlmConfigHost, createStoryRepoHost } from "./support/story-host.js";
import "./support/story-host.js";

void GcComposer;

type ComposerArgs = {
  placeholder: string;
  value: string;
  sending: boolean;
  compact: boolean;
  errorMsg: string;
  embeddedControls: boolean;
};

class StoryComposerFixture extends LitElement {
  @property() placeholder = "";
  @property() value = "";
  @property({ type: Boolean }) sending = false;
  @property({ type: Boolean }) compact = false;
  @property() errorMsg = "";
  @property({ type: Boolean }) embeddedControls = false;

  protected override updated(changed: Map<string, unknown>): void {
    if (changed.has("value")) {
      this.renderRoot.querySelector<GcComposer>("cw-composer")?.setInput(this.value);
    }
  }

  override render() {
    return html`
      <cw-composer
        repo-id="storybook"
        .placeholder=${this.placeholder}
        .sending=${this.sending}
        .compact=${this.compact}
        .errorMsg=${this.errorMsg}
      >
        ${this.embeddedControls
          ? html`<span slot="controls" style="display:flex; gap:.4rem; align-items:center">
              <span style="color:var(--text-muted); font:var(--text-xs) var(--font-mono)"
                >2 queued</span
              >
              <button class="story-button" type="button">steer</button>
            </span>`
          : ""}
      </cw-composer>
    `;
  }

  static override styles = css`
    :host {
      display: block;
    }
  `;
}

if (!customElements.get("cw-story-composer-fixture")) {
  customElements.define("cw-story-composer-fixture", StoryComposerFixture);
}

const meta = {
  title: "Inputs/Composer",
  component: "cw-composer",
  parameters: {
    docs: {
      description: {
        component:
          "AI composer with auto-resizing input, attachments, file mentions, slash-command discovery, argument completion, and a slot for host-owned delivery controls.",
      },
    },
  },
  args: {
    placeholder: "Describe the workflow you want to build…",
    value: "",
    sending: false,
    compact: false,
    errorMsg: "",
    embeddedControls: false,
  },
  render: (args: ComposerArgs) => html`
    <cw-story-host .repoHost=${createStoryRepoHost()} .llmConfigHost=${createStoryLlmConfigHost()}>
      <div class="story-frame constrained" style="align-items: end">
        <div style="width: min(100%, 860px); margin-top: min(55vh, 28rem)">
          <cw-story-composer-fixture
            .placeholder=${args.placeholder}
            .value=${args.value}
            .sending=${args.sending}
            .compact=${args.compact}
            .errorMsg=${args.errorMsg}
            .embeddedControls=${args.embeddedControls}
          ></cw-story-composer-fixture>
        </div>
      </div>
    </cw-story-host>
  `,
} satisfies Meta<ComposerArgs>;

export default meta;
type Story = StoryObj<ComposerArgs>;

export const Empty: Story = {};

export const SlashDiscovery: Story = {
  args: { value: "/" },
};

export const FileMention: Story = {
  args: { value: "Review @src/" },
};

export const EmbeddedControls: Story = {
  args: {
    value: "Prioritize the board layout and preserve keyboard navigation.",
    embeddedControls: true,
    compact: true,
  },
};

export const Sending: Story = {
  args: {
    value: "Generate the project board",
    sending: true,
  },
};

export const Error: Story = {
  args: {
    value: "Generate the project board",
    errorMsg: "The assistant service is unavailable",
  },
};
