import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { fmtJSON, fmtToolSummary, type ToolEvent } from "../lib/chat-types.js";
import type { ToggleToolEventDetail } from "../lib/events.js";
import { browserStyles } from "../styles.js";

export type { ToggleToolEventDetail } from "../lib/events.js";

/**
 * A transport-free summary and disclosure for one agentic tool invocation.
 *
 * The component presents the supplied event and requests disclosure changes;
 * the caller remains responsible for updating `toolEvent.expanded`.
 */
@customElement("cw-tool-event")
export class CwToolEvent extends LitElement {
  @property({ attribute: false }) toolEvent?: ToolEvent;

  private requestToggle(): void {
    const toolEvent = this.toolEvent;
    if (!toolEvent || toolEvent.state === "running") return;
    this.dispatchEvent(
      new CustomEvent<ToggleToolEventDetail>("gc:toggle-tool-event", {
        detail: { toolEvent, expanded: !toolEvent.expanded },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const toolEvent = this.toolEvent;
    if (!toolEvent) return nothing;

    const icon =
      toolEvent.state === "running"
        ? html`<span
            class="tool-dot tool-dot--running"
            part="tool-dot tool-dot--running"
            aria-hidden="true"
          ></span>`
        : toolEvent.state === "error"
          ? html`<span
              class="tool-dot tool-dot--error"
              part="tool-dot tool-dot--error"
              aria-hidden="true"
              >✗</span
            >`
          : html`<span
              class="tool-dot tool-dot--done"
              part="tool-dot tool-dot--done"
              aria-hidden="true"
              >✓</span
            >`;
    const canExpand = toolEvent.state !== "running";

    return html`<div
      class=${`tool-event ${toolEvent.state}`}
      part=${`tool-event ${toolEvent.state}`}
      role="listitem"
    >
      <button
        class="tool-event-head"
        part="tool-event-head"
        ?disabled=${!canExpand}
        aria-expanded=${toolEvent.expanded ? "true" : "false"}
        @click=${this.requestToggle}
      >
        ${icon}
        <span class="tool-name" part="tool-name">${toolEvent.name}</span>
        <span class="tool-summary" part="tool-summary">${fmtToolSummary(toolEvent)}</span>
        ${canExpand
          ? html`<span class="tool-caret" part="tool-caret" aria-hidden="true"
              >${toolEvent.expanded ? "▾" : "▸"}</span
            >`
          : nothing}
      </button>
      ${toolEvent.expanded
        ? html`<div class="tool-body" part="tool-body">
            <div class="tool-body-label" part="tool-body-label">args</div>
            <pre class="tool-body-pre" part="tool-body-pre">${fmtJSON(toolEvent.argsJson)}</pre>
            ${toolEvent.content !== undefined
              ? html`<div class="tool-body-label" part="tool-body-label">
                    result${toolEvent.state === "error" ? " (error)" : ""}
                  </div>
                  <pre
                    class=${`tool-body-pre${toolEvent.state === "error" ? " is-error" : ""}`}
                    part=${`tool-body-pre${toolEvent.state === "error" ? " is-error" : ""}`}
                  >
${toolEvent.content}</pre
                  >`
              : nothing}
          </div>`
        : nothing}
    </div>`;
  }

  static override styles = css`
    ${browserStyles}
    :host {
      display: block;
      min-width: 0;
    }
    .tool-event-head {
      width: 100%;
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      cursor: pointer;
      text-align: left;
    }
    .tool-event-head[disabled] {
      cursor: default;
    }
    .tool-dot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    .tool-summary {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .tool-body {
      padding: 0 8px 8px 28px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .tool-body-pre {
      margin: 0;
      padding: 6px 8px;
      max-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    button:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -1px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-tool-event": CwToolEvent;
  }
}
