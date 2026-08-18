import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ToggleThinkingDetail } from "../lib/events.js";
import { browserStyles } from "../styles.js";

export type { ToggleThinkingDetail } from "../lib/events.js";

/**
 * A transport-free disclosure for assistant reasoning or progress text.
 *
 * The caller supplies and persists disclosure state. Native `<details>`
 * interaction emits `gc:toggle-thinking` with the requested expanded value.
 */
@customElement("cw-thinking-disclosure")
export class CwThinkingDisclosure extends LitElement {
  @property({ attribute: false }) thinking = "";
  @property({ type: Boolean, reflect: true }) expanded = false;
  @property({ type: Boolean, reflect: true }) streaming = false;

  private onToggle(event: Event): void {
    const expanded = (event.currentTarget as HTMLDetailsElement).open;
    if (expanded === this.expanded) return;
    this.dispatchEvent(
      new CustomEvent<ToggleThinkingDetail>("gc:toggle-thinking", {
        detail: { expanded },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (!this.thinking) return nothing;

    return html`<details
      class=${`thinking-block${this.streaming ? " is-streaming" : ""}`}
      part=${`thinking-block${this.streaming ? " is-streaming" : ""}`}
      .open=${this.expanded}
      @toggle=${this.onToggle}
    >
      <summary class="thinking-head" part="thinking-head">
        <span class="thinking-label" part="thinking-label"
          >${this.streaming ? "thinking…" : "thinking"}</span
        >
        <span class="thinking-caret" part="thinking-caret" aria-hidden="true"
          >${this.expanded ? "▾" : "▸"}</span
        >
      </summary>
      ${this.expanded
        ? html`<pre class="thinking-body" part="thinking-body">${this.thinking}</pre>`
        : nothing}
    </details>`;
  }

  static override styles = css`
    ${browserStyles}
    :host {
      display: block;
      min-width: 0;
      margin: var(--space-2, 0.5rem) 0;
    }
    .thinking-block {
      border: 1px solid var(--cw-border-color);
      border-radius: 0.5rem;
      overflow: hidden;
    }
    .thinking-head {
      display: flex;
      width: 100%;
      align-items: center;
      gap: 0.5rem;
      padding: 4px 8px;
      cursor: pointer;
      text-align: left;
      list-style: none;
    }
    .thinking-head::-webkit-details-marker {
      display: none;
    }
    .thinking-label {
      flex: 1;
    }
    .thinking-block.is-streaming .thinking-label::after {
      content: "";
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-left: 0.4rem;
      vertical-align: middle;
    }
    .thinking-body {
      margin: 0;
      padding: 6px 10px 8px;
      max-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-thinking-disclosure": CwThinkingDisclosure;
  }
}
