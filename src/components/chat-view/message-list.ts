import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { copyText } from "../../lib/clipboard.js";
import { type Turn, MessageRole } from "../../lib/chat-types.js";
import type { ToggleThinkingDetail, ToggleToolEventDetail } from "../../lib/events.js";
import { browserStyles } from "../../styles.js";
import "../chat-turn.js";

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
    const pair = this.editablePair();
    const isEditing = this.editingTurnId === t.id;
    const isEditable =
      t.role === MessageRole.USER && !!pair && this.turns[pair.userIdx]?.id === t.id;
    const isRegeneratable =
      t.role !== MessageRole.USER && !!pair && this.turns[pair.assistantIdx]?.id === t.id;
    const lastIdx = this.turns.length - 1;
    const isRetryable =
      t.role !== MessageRole.USER &&
      !!t.error &&
      !t.streaming &&
      lastIdx > 0 &&
      this.turns[lastIdx]?.id === t.id &&
      this.turns[lastIdx - 1]?.role === MessageRole.USER;

    return html`<cw-chat-turn
      data-turn-id=${t.id}
      exportparts="turn, user, assistant, system, turn-label, turn-model, turn-actions, body, md, cursor, turn-attachments, turn-warnings, turn-warning, token-info, thinking-block, is-streaming, thinking-head, thinking-label, thinking-caret, thinking-body, tool-events, tool-event, running, done, error, tool-event-head, tool-dot, tool-dot--running, tool-dot--done, tool-dot--error, tool-name, tool-summary, tool-caret, tool-body, tool-body-label, tool-body-pre, is-error, attachment, attachment-chip, is-image, is-file, attachment-thumb, attachment-glyph, attachment-meta, attachment-name, attachment-size"
      .turn=${t}
      @gc:toggle-thinking=${this.toggleThinking}
      @gc:toggle-tool-event=${this.toggleToolEvent}
    >
      ${isEditable && !isEditing
        ? html`<button
            slot="actions"
            class="turn-action"
            part="turn-action"
            @click=${() => this.beginEditLast()}
            aria-label="Edit message and resend"
            title="Edit message and resend"
          >
            edit
          </button>`
        : nothing}
      ${t.role === MessageRole.USER || !t.streaming
        ? html`${isRetryable
              ? html`<button
                  slot="actions"
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
                  slot="actions"
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
              slot="actions"
              class="turn-action"
              part="turn-action"
              @click=${(event: Event) => this.copyTurn(event, t)}
              aria-label="Copy message"
              title="Copy message"
            >
              copy
            </button>`
        : nothing}
      ${isEditing ? this.renderEditTurn(t) : nothing}
    </cw-chat-turn>`;
  }

  private toggleThinking(event: CustomEvent<ToggleThinkingDetail>) {
    const id = (event.currentTarget as HTMLElement).dataset.turnId;
    if (!id) return;
    const { expanded } = event.detail;
    this.fire("gc:update-turns", {
      updater: (turns: Turn[]) =>
        turns.map((t) => (t.id === id ? { ...t, thinkingExpanded: expanded } : t)),
    });
  }

  private toggleToolEvent(event: CustomEvent<ToggleToolEventDetail>) {
    const id = (event.currentTarget as HTMLElement).dataset.turnId;
    if (!id) return;
    const { toolEvent, expanded } = event.detail;
    this.fire("gc:update-turns", {
      updater: (turns: Turn[]) =>
        turns.map((t) =>
          t.id === id && t.tools
            ? {
                ...t,
                tools: t.tools.map((candidate) =>
                  candidate.id === toolEvent.id ? { ...candidate, expanded } : candidate,
                ),
              }
            : t,
        ),
    });
  }

  private renderEditTurn(t: Turn) {
    const rows = Math.max(2, Math.min(12, t.content.split("\n").length));
    return html`
      <div slot="body" class="body edit" part="body edit">
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

  private fire<T>(name: string, detail: T) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  static override styles = css`
    ${browserStyles}
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
    cw-chat-turn {
      margin-bottom: var(--space-7, 2rem);
    }
    cw-chat-turn:last-child {
      margin-bottom: var(--space-2, 0.5rem);
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
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border-radius: 0.75rem;
      background: ButtonFace;
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
