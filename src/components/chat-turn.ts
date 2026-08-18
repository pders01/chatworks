import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { copyText } from "../lib/clipboard.js";
import { estimateCost, fmtNum, MessageRole, type ToolEvent, type Turn } from "../lib/chat-types.js";
import { browserStyles } from "../styles.js";
import "./attachment.js";
import "./thinking-disclosure.js";
import "./tool-event.js";

/**
 * Presentation for one transport-free chat turn.
 *
 * The `actions` slot accepts caller-owned controls. The `body` slot can replace
 * the normal text/HTML body, for example while the owning message list edits a
 * turn. Ordering, editing state, retry/regeneration policy, and scroll behavior
 * remain caller-owned. Nested tool and thinking events bubble unchanged.
 */
@customElement("cw-chat-turn")
export class CwChatTurn extends LitElement {
  @property({ attribute: false }) turn?: Turn;

  private onContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.classList.contains("copy-code")) return;
    const text = target.closest(".code-block")?.querySelector("pre")?.textContent ?? "";
    if (!text) return;
    void copyText(target, text, "Code copied");
  }

  private renderBody(turn: Turn) {
    return turn.role === MessageRole.ASSISTANT && !turn.streaming && turn.html
      ? html`<div class="body md" part="body md">${unsafeHTML(turn.html)}</div>`
      : html`<div class="body" part="body">
          ${turn.content}${turn.streaming
            ? html`<span class="cursor" part="cursor">▍</span>`
            : nothing}
        </div>`;
  }

  private renderAttachments(turn: Turn) {
    if (!turn.attachments?.length) return nothing;
    return html`<div class="turn-attachments" part="turn-attachments" role="list">
      ${turn.attachments.map(
        (attachment) => html`<cw-attachment
          part="attachment"
          exportparts="attachment-chip, is-image, is-file, attachment-thumb, attachment-glyph, attachment-meta, attachment-name, attachment-size"
          .attachment=${attachment}
          list-item
        ></cw-attachment>`,
      )}
    </div>`;
  }

  private renderThinking(turn: Turn) {
    if (!turn.thinking) return nothing;
    return html`<cw-thinking-disclosure
      exportparts="thinking-block, is-streaming, thinking-head, thinking-label, thinking-caret, thinking-body"
      .thinking=${turn.thinking}
      .expanded=${!!turn.thinkingExpanded}
      .streaming=${!!turn.streaming}
    ></cw-thinking-disclosure>`;
  }

  private renderToolEvents(events: ToolEvent[]) {
    return html`<div class="tool-events" part="tool-events" role="list">
      ${events.map(
        (toolEvent) => html`<cw-tool-event
          exportparts="tool-event, running, done, error, tool-event-head, tool-dot, tool-dot--running, tool-dot--done, tool-dot--error, tool-name, tool-summary, tool-caret, tool-body, tool-body-label, tool-body-pre, is-error"
          .toolEvent=${toolEvent}
        ></cw-tool-event>`,
      )}
    </div>`;
  }

  private renderTokenInfo(turn: Turn) {
    if (turn.streaming) {
      return html`<div class="token-info" part="token-info">streaming...</div>`;
    }
    if (!turn.tokensIn && !turn.tokensOut) return nothing;
    return html`<div class="token-info" part="token-info">
      ${turn.model ? turn.model.toLowerCase() : ""}${turn.model ? " · " : ""}${fmtNum(
        turn.tokensIn ?? 0,
      )}
      in · ${fmtNum(turn.tokensOut ?? 0)} out ·
      ${estimateCost(turn.model ?? "", turn.tokensIn ?? 0, turn.tokensOut ?? 0)}
    </div>`;
  }

  override render() {
    const turn = this.turn;
    if (!turn) return nothing;

    const roleClass =
      turn.role === MessageRole.USER
        ? "user"
        : turn.role === MessageRole.ASSISTANT
          ? "assistant"
          : "system";
    const label = turn.role === MessageRole.USER ? "you" : "assistant";
    const body = this.renderBody(turn);

    return html`<article
      class=${`turn ${roleClass}`}
      part=${`turn ${roleClass}`}
      @click=${this.onContentClick}
    >
      <div class="turn-label" part="turn-label">
        ${label}${turn.role !== MessageRole.USER && turn.model
          ? html`<span class="turn-model" part="turn-model">${turn.model.toLowerCase()}</span>`
          : nothing}
      </div>
      <slot class="turn-actions" part="turn-actions" name="actions"></slot>
      ${turn.role === MessageRole.USER
        ? html`${this.renderAttachments(turn)}<slot name="body">${body}</slot> ${turn.warnings
              ?.length
              ? html`<div class="turn-warnings" part="turn-warnings" role="status">
                  ${turn.warnings.map(
                    (warning) => html`<div class="turn-warning" part="turn-warning">
                      ⚠ ${warning}
                    </div>`,
                  )}
                </div>`
              : nothing}`
        : html`${this.renderThinking(turn)}
            ${turn.tools?.length ? this.renderToolEvents(turn.tools) : nothing}
            <slot name="body">${body}</slot>
            ${this.renderTokenInfo(turn)}`}
    </article>`;
  }

  static override styles = css`
    ${browserStyles}
    :host {
      display: block;
      min-width: 0;
    }
    .turn {
      position: relative;
    }
    .turn-actions {
      position: absolute;
      top: 0;
      right: 0;
      display: flex;
      gap: 4px;
    }
    ::slotted([slot="actions"]) {
      min-block-size: 2.25rem;
      min-inline-size: 2.25rem;
      padding: 2px 8px;
      font: inherit;
    }
    ::slotted(button[slot="actions"]:not(:disabled)) {
      cursor: pointer;
    }
    .turn-label {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      margin-bottom: var(--space-2, 0.5rem);
      font-weight: 650;
    }
    .turn-model {
      color: var(--cw-muted-color);
      font-size: 0.875rem;
      font-weight: 400;
    }
    .turn-model::before {
      content: "·";
      margin-right: var(--space-2, 0.5rem);
    }
    .turn.user .body {
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border-radius: 0.75rem;
      background: ButtonFace;
    }
    .body {
      white-space: pre-wrap;
      word-break: break-word;
    }
    .body.md {
      white-space: normal;
    }
    .body.md > *:first-child {
      margin-top: 0;
    }
    .body.md > *:last-child {
      margin-bottom: 0;
    }
    .body.md p {
      margin: 0.55em 0;
    }
    .body.md ul,
    .body.md ol {
      margin: 0.55em 0;
      padding-left: 1.4em;
    }
    .body.md li {
      margin: 0.2em 0;
    }
    .body.md h1,
    .body.md h2,
    .body.md h3,
    .body.md h4 {
      margin: 1em 0 0.4em;
    }
    .body.md code {
      padding: 0.08em 0.4em;
    }
    .body.md pre {
      margin: 0.8em 0;
      padding: 0.9rem 1.1rem;
      overflow-x: auto;
    }
    .body.md pre code {
      padding: 0;
    }
    .body.md .diff-block {
      margin: 0.8em 0;
      overflow: hidden;
    }
    .body.md .diff-block > summary {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      cursor: pointer;
      user-select: none;
      list-style: none;
    }
    .body.md .diff-block > summary::-webkit-details-marker {
      display: none;
    }
    .body.md .diff-block > summary::before {
      content: "▶";
    }
    .body.md .diff-block[open] > summary::before {
      transform: rotate(90deg);
    }
    .body.md .diff-block > pre,
    .body.md .diff-block > .shiki {
      margin: 0;
    }
    .body.md blockquote {
      margin: 0.7em 0;
      padding: 0.1em 0.95em;
    }
    .body.md hr {
      margin: 1.2em 0;
    }
    .body.md table {
      border-collapse: collapse;
      margin: 0.7em 0;
    }
    .body.md th,
    .body.md td {
      padding: 0.35em 0.7em;
      text-align: left;
    }
    .md .code-block {
      position: relative;
    }
    .md .copy-code {
      position: absolute;
      top: var(--space-2, 0.5rem);
      right: var(--space-2, 0.5rem);
      padding: 2px 8px;
      cursor: pointer;
    }
    .md .copy-code:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 1px;
    }
    .cursor {
      display: inline-block;
      margin-left: 0.1ch;
      width: 0.5ch;
    }
    .token-info {
      margin-top: var(--space-2, 0.5rem);
      color: var(--cw-muted-color);
      font-size: 0.875rem;
    }
    .turn-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 0.5rem);
      margin-top: var(--space-2, 0.5rem);
    }
    .turn-warnings {
      margin-top: var(--space-2, 0.5rem);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .tool-events {
      margin: var(--space-2, 0.5rem) 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-chat-turn": CwChatTurn;
  }
}
