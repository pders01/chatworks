import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { copyText } from "../../lib/clipboard.js";
import {
  type Turn,
  type ToolEvent,
  type ClientAttachment,
  MessageRole,
  estimateCost,
  fmtNum,
  fmtBytes,
  fmtToolSummary,
  fmtJSON,
} from "../../lib/chat-types.js";

@customElement("cw-message-list")
export class GcMessageList extends LitElement {
  @property({ type: Array }) turns: Turn[] = [];
  @property({ type: Boolean }) sending = false;

  @state() private editingTurnId = "";

  // True when the messages pane is scrolled within 64px of its bottom.
  private scrollPinnedToBottom = true;

  private onScroll = (e: Event) => {
    const pane = e.currentTarget as HTMLElement;
    const nearBottomPx = 64;
    this.scrollPinnedToBottom =
      pane.scrollHeight - pane.scrollTop - pane.clientHeight <= nearBottomPx;
  };

  scrollToBottom() {
    if (!this.scrollPinnedToBottom) return;
    requestAnimationFrame(() => {
      const pane = this.renderRoot.querySelector(".messages");
      if (pane) pane.scrollTop = pane.scrollHeight;
    });
  }

  pinToBottom() {
    this.scrollPinnedToBottom = true;
  }

  override render() {
    return html`
      <div
        class="messages"
        part="messages"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        @click=${this.onMessagesClick}
        @scroll=${this.onScroll}
      >
        <div class="messages-inner" part="messages-inner">
          ${repeat(
            this.turns,
            (t) => t.id,
            (t) => this.renderTurn(t),
          )}
        </div>
      </div>
    `;
  }

  private renderTurn(t: Turn) {
    const roleClass =
      t.role === MessageRole.USER
        ? "user"
        : t.role === MessageRole.ASSISTANT
          ? "assistant"
          : "system";
    const body =
      t.role === MessageRole.ASSISTANT && !t.streaming && t.html
        ? html`<div class="body md" part="body md">${unsafeHTML(t.html)}</div>`
        : html`<div class="body" part="body">
            ${t.content}${t.streaming ? html`<span class="cursor" part="cursor">▍</span>` : nothing}
          </div>`;

    if (t.role === MessageRole.USER) {
      const pair = this.editablePair();
      const isEditable = !!pair && this.turns[pair.userIdx]?.id === t.id;
      const isEditing = this.editingTurnId === t.id;
      return html`
        <article class="turn user" part="turn user">
          <div class="turn-label" part="turn-label">you</div>
          <div class="turn-actions" part="turn-actions">
            ${isEditable && !isEditing
              ? html`<button
                  class="turn-action"
                  part="turn-action"
                  @click=${() => this.beginEditLast()}
                  aria-label="Edit message and resend"
                  title="Edit message and resend"
                >
                  edit
                </button>`
              : nothing}
            <button
              class="turn-action"
              part="turn-action"
              @click=${(e: Event) => this.copyTurn(e, t)}
              aria-label="Copy message"
              title="Copy message"
            >
              copy
            </button>
          </div>
          ${t.attachments && t.attachments.length > 0
            ? html`<div class="turn-attachments" part="turn-attachments" role="list">
                ${t.attachments.map((a) => this.renderAttachmentChip(a))}
              </div>`
            : nothing}
          ${isEditing ? this.renderEditTurn(t) : body}
          ${t.warnings && t.warnings.length > 0
            ? html`<div class="turn-warnings" part="turn-warnings" role="status">
                ${t.warnings.map(
                  (w) => html`<div class="turn-warning" part="turn-warning">⚠ ${w}</div>`,
                )}
              </div>`
            : nothing}
        </article>
      `;
    }

    const tokenInfo = t.streaming
      ? html`<div class="token-info" part="token-info">streaming...</div>`
      : t.tokensIn || t.tokensOut
        ? html`<div class="token-info" part="token-info">
            ${t.model ? t.model.toLowerCase() : ""}${t.model ? " · " : ""}${fmtNum(t.tokensIn ?? 0)}
            in · ${fmtNum(t.tokensOut ?? 0)} out ·
            ${estimateCost(t.model ?? "", t.tokensIn ?? 0, t.tokensOut ?? 0)}
          </div>`
        : nothing;

    const pair = this.editablePair();
    const isRegeneratable = !!pair && this.turns[pair.assistantIdx]?.id === t.id;
    const lastIdx = this.turns.length - 1;
    const isRetryable =
      !!t.error &&
      !t.streaming &&
      lastIdx > 0 &&
      this.turns[lastIdx]?.id === t.id &&
      this.turns[lastIdx - 1]?.role === MessageRole.USER;

    return html`
      <article class="turn ${roleClass}" part="turn ${roleClass}">
        <div class="turn-label" part="turn-label">
          assistant${t.model
            ? html`<span class="turn-model" part="turn-model">${t.model.toLowerCase()}</span>`
            : nothing}
        </div>
        ${t.streaming
          ? nothing
          : html`<div class="turn-actions" part="turn-actions">
              ${isRetryable
                ? html`<button
                    class="turn-action primary"
                    part="turn-action primary"
                    @click=${() => this.fireRetry()}
                    aria-label="Retry"
                    title="Retry"
                  >
                    retry
                  </button>`
                : nothing}
              ${isRegeneratable
                ? html`<button
                    class="turn-action"
                    part="turn-action"
                    @click=${() => this.fireRegenerate()}
                    aria-label="Regenerate response"
                    title="Regenerate response"
                  >
                    regenerate
                  </button>`
                : nothing}
              <button
                class="turn-action"
                part="turn-action"
                @click=${(e: Event) => this.copyTurn(e, t)}
                aria-label="Copy message"
                title="Copy message"
              >
                copy
              </button>
            </div>`}
        ${this.renderThinking(t)}
        ${t.tools && t.tools.length > 0 ? this.renderToolEvents(t.tools) : nothing} ${body}
        ${tokenInfo}
      </article>
    `;
  }

  private renderThinking(t: Turn) {
    if (!t.thinking) return nothing;
    const label = t.streaming ? "thinking…" : "thinking";
    return html`<div
      class="thinking-block ${t.streaming ? "is-streaming" : ""}"
      part="thinking-block ${t.streaming ? "is-streaming" : ""}"
    >
      <button
        class="thinking-head"
        part="thinking-head"
        aria-expanded=${t.thinkingExpanded ? "true" : "false"}
        @click=${() => this.toggleThinking(t.id)}
      >
        <span class="thinking-label" part="thinking-label">${label}</span>
        <span class="thinking-caret" part="thinking-caret" aria-hidden="true"
          >${t.thinkingExpanded ? "▾" : "▸"}</span
        >
      </button>
      ${t.thinkingExpanded
        ? html`<pre class="thinking-body" part="thinking-body">${t.thinking}</pre>`
        : nothing}
    </div>`;
  }

  private toggleThinking(id: string) {
    this.fire("gc:update-turns", {
      updater: (turns: Turn[]) =>
        turns.map((t) => (t.id === id ? { ...t, thinkingExpanded: !t.thinkingExpanded } : t)),
    });
  }

  private renderToolEvents(events: ToolEvent[]) {
    return html`<div class="tool-events" part="tool-events" role="list">
      ${events.map((ev) => this.renderToolEvent(ev))}
    </div>`;
  }

  private renderToolEvent(ev: ToolEvent) {
    const icon =
      ev.state === "running"
        ? html`<span
            class="tool-dot tool-dot--running"
            part="tool-dot tool-dot--running"
            aria-hidden="true"
          ></span>`
        : ev.state === "error"
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
    const summary = fmtToolSummary(ev);
    const canExpand = ev.state !== "running";
    return html`<div class="tool-event ${ev.state}" part="tool-event ${ev.state}" role="listitem">
      <button
        class="tool-event-head"
        part="tool-event-head"
        ?disabled=${!canExpand}
        aria-expanded=${ev.expanded ? "true" : "false"}
        @click=${() => this.toggleToolEvent(ev.id)}
      >
        ${icon}
        <span class="tool-name" part="tool-name">${ev.name}</span>
        <span class="tool-summary" part="tool-summary">${summary}</span>
        ${canExpand
          ? html`<span class="tool-caret" part="tool-caret" aria-hidden="true"
              >${ev.expanded ? "▾" : "▸"}</span
            >`
          : nothing}
      </button>
      ${ev.expanded
        ? html`<div class="tool-body" part="tool-body">
            <div class="tool-body-label" part="tool-body-label">args</div>
            <pre class="tool-body-pre" part="tool-body-pre">${fmtJSON(ev.argsJson)}</pre>
            ${ev.content !== undefined
              ? html`<div class="tool-body-label" part="tool-body-label">
                    result${ev.state === "error" ? " (error)" : ""}
                  </div>
                  <pre
                    class="tool-body-pre ${ev.state === "error" ? "is-error" : ""}"
                    part="tool-body-pre ${ev.state === "error" ? "is-error" : ""}"
                  >
${ev.content}</pre
                  >`
              : nothing}
          </div>`
        : nothing}
    </div>`;
  }

  private toggleToolEvent(id: string) {
    this.fire("gc:update-turns", {
      updater: (turns: Turn[]) =>
        turns.map((t) =>
          t.tools
            ? {
                ...t,
                tools: t.tools.map((ev) => (ev.id === id ? { ...ev, expanded: !ev.expanded } : ev)),
              }
            : t,
        ),
    });
  }

  private renderAttachmentChip(a: ClientAttachment) {
    const isImage = a.mimeType.startsWith("image/") && a.url;
    const tooltip = `${a.filename} · ${fmtBytes(a.size)}`;
    if (isImage) {
      return html`<div
        class="attachment-chip is-image"
        part="attachment-chip is-image"
        role="listitem"
        title=${tooltip}
      >
        <img src=${a.url!} alt=${a.filename} class="attachment-thumb" part="attachment-thumb" />
      </div>`;
    }
    return html`<div
      class="attachment-chip is-file"
      part="attachment-chip is-file"
      role="listitem"
      title=${tooltip}
    >
      <span class="attachment-glyph" part="attachment-glyph" aria-hidden="true">📄</span>
      <span class="attachment-meta" part="attachment-meta">
        <span class="attachment-name" part="attachment-name">${a.filename}</span>
        <span class="attachment-size" part="attachment-size">${fmtBytes(a.size)}</span>
      </span>
    </div>`;
  }

  private renderEditTurn(t: Turn) {
    const rows = Math.max(2, Math.min(12, t.content.split("\n").length));
    return html`
      <div class="body edit" part="body edit">
        <textarea
          class="edit-input"
          part="edit-input"
          rows=${rows}
          .value=${t.content}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Escape") {
              e.preventDefault();
              this.cancelEdit();
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const v = (e.target as HTMLTextAreaElement).value;
              this.commitEdit(t.id, v);
            }
          }}
          @input=${(e: Event) => {
            const ta = e.target as HTMLTextAreaElement;
            ta.style.height = "auto";
            ta.style.height = `${ta.scrollHeight}px`;
          }}
        ></textarea>
        <div class="edit-actions" part="edit-actions">
          <button class="turn-action" part="turn-action" @click=${() => this.cancelEdit()}>
            cancel
          </button>
          <button
            class="turn-action primary"
            part="turn-action primary"
            @click=${(e: Event) => {
              const ta = (
                e.currentTarget as HTMLElement
              ).parentElement?.parentElement?.querySelector<HTMLTextAreaElement>(".edit-input");
              if (ta) this.commitEdit(t.id, ta.value);
            }}
          >
            send
          </button>
        </div>
      </div>
    `;
  }

  private editablePair(): { userIdx: number; assistantIdx: number } | null {
    if (this.sending) return null;
    const last = this.turns.length - 1;
    if (last < 1) return null;
    const a = this.turns[last];
    const u = this.turns[last - 1];
    if (!a || !u) return null;
    if (a.role !== MessageRole.ASSISTANT || u.role !== MessageRole.USER) return null;
    if (a.streaming) return null;
    if (a.id.startsWith("local-") || u.id.startsWith("local-")) return null;
    return { userIdx: last - 1, assistantIdx: last };
  }

  private beginEditLast() {
    const pair = this.editablePair();
    if (!pair) return;
    const user = this.turns[pair.userIdx]!;
    this.editingTurnId = user.id;
  }

  private cancelEdit() {
    this.editingTurnId = "";
  }

  private commitEdit(turnId: string, newText: string) {
    const trimmed = newText.trim();
    const idx = this.turns.findIndex((t) => t.id === turnId);
    if (idx < 0 || trimmed === "" || trimmed === this.turns[idx]?.content) {
      this.editingTurnId = "";
      return;
    }
    const target = this.turns[idx]!;
    this.editingTurnId = "";
    this.fire("gc:edit-turn", { text: trimmed, replaceFromMessageId: target.id, sliceAt: idx });
  }

  private fireRetry() {
    this.fire("gc:retry", {});
  }

  private fireRegenerate() {
    this.fire("gc:regenerate", {});
  }

  private copyTurn(e: Event, t: Turn) {
    e.stopPropagation();
    void copyText(e.currentTarget as HTMLElement, t.content, "Message copied");
  }

  private onMessagesClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target?.classList.contains("copy-code")) return;
    const block = target.closest(".code-block");
    const pre = block?.querySelector("pre");
    const text = pre?.textContent ?? "";
    if (!text) return;
    void copyText(target, text, "Code copied");
  };

  private fire<T>(name: string, detail: T) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  static override styles = css`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
    }
    .messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: var(--space-6, 1.5rem) var(--space-7, 2rem) var(--space-4, 1rem);
    }
    .messages-inner {
      max-width: var(--content-max-width, 52rem);
      margin: 0 auto;
    }
    :host([unfocused]) .messages-inner {
      max-width: none;
    }

    /* ── Turns ───────────────────────────────────────────────────── */
    .turn {
      position: relative;
      margin-bottom: var(--space-7, 2rem);
    }
    .turn:last-child {
      margin-bottom: var(--space-2, 0.5rem);
    }
    .turn-actions {
      position: absolute;
      top: 0;
      right: 0;
      display: flex;
      gap: 4px;
    }
    .turn-action {
      padding: 2px 8px;
      cursor: pointer;
    }
    .turn-action:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 1px;
    }
    .body.edit {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 0.5rem);
    }
    .edit-input {
      width: 100%;
      resize: none;
      padding: var(--space-2, 0.5rem);
    }
    .edit-input:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 1px;
    }
    .edit-actions {
      display: flex;
      gap: 4px;
      justify-content: flex-end;
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
    .turn-label {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 0.45rem;
    }
    .turn-model::before {
      content: "·";
      margin-right: var(--space-2, 0.5rem);
    }
    .turn.user .body {
      padding: 0.55rem 0.85rem;
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
    .cursor {
      display: inline-block;
      margin-left: 0.1ch;
      width: 0.5ch;
    }
    .token-info {
      margin-top: var(--space-2, 0.5rem);
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
    .thinking-block {
      margin: var(--space-2, 0.5rem) 0;
    }
    .thinking-head {
      display: flex;
      width: 100%;
      align-items: center;
      gap: 0.5rem;
      padding: 4px 8px;
      cursor: pointer;
      text-align: left;
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
    .tool-events {
      margin: var(--space-2, 0.5rem) 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .tool-event-head {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 4px 8px;
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
    .attachment-chip {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .attachment-chip.is-image {
      padding: 0;
      overflow: hidden;
      width: 56px;
      height: 56px;
    }
    .attachment-chip.is-file {
      gap: 0.4rem;
      padding: 5px 6px 5px 8px;
      max-width: 240px;
    }
    .attachment-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .attachment-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .attachment-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Scrollbar */
    .messages::-webkit-scrollbar {
      width: 8px;
    }
    /* Focus */
    :focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
    button:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -1px;
    }
  `;
}

// Re-export MessageRole so the parent can use it without a separate import.
export { MessageRole };

declare global {
  interface HTMLElementTagNameMap {
    "cw-message-list": GcMessageList;
  }
}
