import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { consume } from "@lit/context";
import { chatHostContext, type ChatHost, type ChatSession } from "../../host.js";
import { messageOf } from "../../lib/chat-types.js";
import { browserStyles } from "../../styles.js";

@customElement("cw-session-sidebar")
export class GcSessionSidebar extends LitElement {
  @consume({ context: chatHostContext, subscribe: true })
  private chatHost!: ChatHost;

  @property({ type: Array }) sessions: ChatSession[] = [];
  @property({ type: String }) selected = "";
  @property({ type: String }) repoId = "";

  @state() private editingSessionId = "";
  @state() private sessionFilter = "";
  @state() private confirmingDeleteSession = "";
  private confirmResetTimer: ReturnType<typeof setTimeout> | null = null;

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.confirmResetTimer) {
      clearTimeout(this.confirmResetTimer);
      this.confirmResetTimer = null;
    }
  }

  private fire<T>(name: string, detail: T) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  private startRename(sessionId: string) {
    this.editingSessionId = sessionId;
    requestAnimationFrame(() => {
      const input = this.renderRoot.querySelector<HTMLInputElement>(
        `.rename-input[data-id="${sessionId}"]`,
      );
      input?.focus();
      input?.select();
    });
  }

  private async renameSession(sessionId: string, title: string) {
    this.editingSessionId = "";
    title = title.trim();
    if (!title) return;
    try {
      await this.chatHost.renameSession({ sessionId, title });
      this.fire("gc:sessions-changed", {});
    } catch {
      // Silently fail — title stays as-is.
    }
  }

  /** Pinned sessions float to the top; within each group the server's
   * supplied order is preserved (most recent first). Uses Array.sort
   * which is stable in every modern JS engine, so equally-ranked
   * sessions don't shuffle between renders. */
  private sortedSessions(): ChatSession[] {
    return [...this.sessions].sort((a, b) => {
      if (a.pinned === b.pinned) return 0;
      return a.pinned ? -1 : 1;
    });
  }

  private async pinSession(sessionId: string, pinned: boolean) {
    try {
      await this.chatHost.pinSession({ sessionId, pinned });
      this.fire("gc:sessions-changed", {});
    } catch (e) {
      this.fire("gc:error", { message: messageOf(e) });
    }
  }

  private deleteSession(sessionId: string) {
    if (this.confirmingDeleteSession !== sessionId) {
      this.confirmingDeleteSession = sessionId;
      if (this.confirmResetTimer) clearTimeout(this.confirmResetTimer);
      this.confirmResetTimer = setTimeout(() => {
        this.confirmingDeleteSession = "";
        this.confirmResetTimer = null;
      }, 3000);
      return;
    }
    if (this.confirmResetTimer) {
      clearTimeout(this.confirmResetTimer);
      this.confirmResetTimer = null;
    }
    this.confirmingDeleteSession = "";
    this.fire("gc:delete-session", { sessionId });
  }

  override render() {
    return html`
      <button
        class="new"
        part="new"
        @click=${() => this.fire("gc:new-chat", {})}
        aria-label="New chat (${navigator.platform.includes("Mac") ? "⌘" : "Ctrl+"}K)"
      >
        <span class="plus" part="plus" aria-hidden="true">+</span> New chat
      </button>
      <input
        class="session-filter"
        part="session-filter"
        type="search"
        placeholder="Filter sessions…"
        .value=${this.sessionFilter}
        @input=${(e: Event) => {
          this.sessionFilter = (e.target as HTMLInputElement).value;
        }}
        aria-label="Filter sessions"
      />
      <div class="sidebar-label" part="sidebar-label" id="sessions-label">Sessions</div>
      <ul class="sessions" part="sessions" role="list" aria-labelledby="sessions-label">
        ${this.sessions.length === 0
          ? html`<li class="sidebar-empty" part="sidebar-empty">No sessions yet</li>`
          : this.sortedSessions()
              .filter(
                (sess) =>
                  !this.sessionFilter ||
                  sess.title.toLowerCase().includes(this.sessionFilter.toLowerCase()),
              )
              .map(
                (sess) => html`
                  <li>
                    <div class="sess-row" part="sess-row">
                      <button
                        class="sess ${sess.id === this.selected ? "selected" : ""}"
                        part="sess ${sess.id === this.selected ? "selected" : ""}"
                        @click=${() => this.fire("gc:select-session", { sessionId: sess.id })}
                        @dblclick=${(e: Event) => {
                          e.preventDefault();
                          this.startRename(sess.id);
                        }}
                        @keydown=${(e: KeyboardEvent) => {
                          if (e.key === "F2") {
                            e.preventDefault();
                            this.startRename(sess.id);
                          }
                        }}
                        title="Double-click or F2 to rename"
                        aria-current=${sess.id === this.selected ? "true" : "false"}
                      >
                        ${this.editingSessionId === sess.id
                          ? html`<input
                              class="rename-input"
                              part="rename-input"
                              data-id=${sess.id}
                              .value=${sess.title}
                              @keydown=${(e: KeyboardEvent) => {
                                if (e.key === "Enter") {
                                  void this.renameSession(
                                    sess.id,
                                    (e.target as HTMLInputElement).value,
                                  );
                                }
                                if (e.key === "Escape") this.editingSessionId = "";
                              }}
                              @blur=${(e: Event) =>
                                void this.renameSession(
                                  sess.id,
                                  (e.target as HTMLInputElement).value,
                                )}
                              @click=${(e: Event) => e.stopPropagation()}
                            />`
                          : html`<span class="sess-title" part="sess-title">${sess.title}</span>`}
                        <span
                          class="sess-meta"
                          part="sess-meta"
                          aria-label="${sess.messageCount} messages"
                          >${sess.messageCount}</span
                        >
                      </button>
                      <button
                        class="sess-pin ${sess.pinned ? "pinned" : ""}"
                        part="sess-pin ${sess.pinned ? "pinned" : ""}"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          void this.pinSession(sess.id, !sess.pinned);
                        }}
                        aria-label=${sess.pinned ? "Unpin session" : "Pin session"}
                        title=${sess.pinned ? "Unpin" : "Pin"}
                      >
                        ${sess.pinned ? "\u2605" : "\u2606"}
                      </button>
                      <button
                        class="sess-delete ${this.confirmingDeleteSession === sess.id
                          ? "confirming"
                          : ""}"
                        part="sess-delete ${this.confirmingDeleteSession === sess.id
                          ? "confirming"
                          : ""}"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          this.deleteSession(sess.id);
                        }}
                        aria-label=${this.confirmingDeleteSession === sess.id
                          ? "Click again to confirm delete"
                          : "Delete session"}
                        title=${this.confirmingDeleteSession === sess.id
                          ? "Click again to confirm"
                          : "Delete"}
                      >
                        ${this.confirmingDeleteSession === sess.id ? "?" : "×"}
                      </button>
                    </div>
                  </li>
                `,
              )}
      </ul>
    `;
  }

  /** Focus the "new chat" button — called by parent when drawer opens. */
  focusNew() {
    const target = this.renderRoot.querySelector<HTMLElement>(".new");
    target?.focus();
  }

  static override styles = css`
    ${browserStyles}
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .new {
      margin: var(--space-4, 1rem) var(--space-4, 1rem) var(--space-3, 0.75rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border-color: Highlight;
      color: HighlightText;
      background: Highlight;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }
    .session-filter {
      margin: 0 var(--space-4, 1rem) var(--space-3, 0.75rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      width: calc(100% - 2rem);
      box-sizing: border-box;
    }
    .sidebar-label {
      padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
      color: var(--cw-muted-color);
      font-size: 0.875rem;
      font-weight: 600;
    }
    .sessions {
      list-style: none;
      padding: 0 var(--space-2, 0.5rem) var(--space-2, 0.5rem);
      margin: 0;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }
    .sessions li {
      margin: 0;
    }
    .sess {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      width: 100%;
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border: 1px solid transparent;
      border-radius: 0.375rem;
      color: inherit;
      background: transparent;
      text-align: left;
      cursor: pointer;
    }
    .sess:hover {
      background: ButtonFace;
    }
    .sess.selected {
      color: HighlightText;
      background: Highlight;
    }
    .sess-row {
      display: flex;
      align-items: center;
    }
    .sess-row .sess {
      flex: 1;
      min-width: 0;
    }
    .sess-delete {
      flex-shrink: 0;
      width: 2.25rem;
      height: 2.25rem;
      border-color: transparent;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }
    .sess-delete:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -2px;
    }
    .rename-input {
      width: 100%;
      padding: 0.1rem 0.3rem;
    }
    .sess-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .sess-meta {
      flex-shrink: 0;
      color: var(--cw-muted-color);
      font-size: 0.8125rem;
    }
    .sess.selected .sess-meta {
      color: inherit;
    }
    .sidebar-empty {
      padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
      color: var(--cw-muted-color);
    }
    .sess-pin {
      flex-shrink: 0;
      width: 2.25rem;
      height: 2.25rem;
      padding: 0;
      border-color: transparent;
      color: inherit;
      background: transparent;
      cursor: pointer;
      text-align: center;
    }
    .sess-pin:hover,
    .sess-delete:hover {
      background: ButtonFace;
    }
    /* Scrollbar */
    .sessions::-webkit-scrollbar {
      width: 8px;
    }
    /* Focus */
    :focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
    button:focus-visible,
    .sess:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -1px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-session-sidebar": GcSessionSidebar;
  }
}
