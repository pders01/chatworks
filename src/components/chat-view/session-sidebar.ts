import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { consume } from "@lit/context";
import { chatHostContext, type ChatHost, type ChatSession } from "../../host.js";
import { messageOf } from "../../lib/chat-types.js";

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
        <span class="plus" part="plus" aria-hidden="true">+</span> new chat
      </button>
      <input
        class="session-filter"
        part="session-filter"
        type="search"
        placeholder="filter sessions…"
        .value=${this.sessionFilter}
        @input=${(e: Event) => {
          this.sessionFilter = (e.target as HTMLInputElement).value;
        }}
        aria-label="Filter sessions"
      />
      <div class="sidebar-label" part="sidebar-label" id="sessions-label">sessions</div>
      <ul class="sessions" part="sessions" role="list" aria-labelledby="sessions-label">
        ${this.sessions.length === 0
          ? html`<li class="sidebar-empty" part="sidebar-empty">no sessions yet</li>`
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
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .new {
      margin: 0.85rem 0.85rem 0.6rem;
      padding: var(--space-2, 0.5rem) 0.7rem;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }
    .session-filter {
      margin: 0 0.85rem var(--space-2, 0.5rem);
      padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
      width: calc(100% - 1.7rem);
      box-sizing: border-box;
    }
    .sidebar-label {
      padding: var(--space-2, 0.5rem) 0.95rem 0.35rem;
    }
    .sessions {
      list-style: none;
      padding: 0 0.4rem 0.4rem;
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
      padding: 0.4rem 0.6rem;
      text-align: left;
      cursor: pointer;
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
      width: 24px;
      height: 24px;
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
    }
    .sidebar-empty {
      padding: var(--space-2, 0.5rem) 0.85rem;
    }
    .sess-pin {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      cursor: pointer;
      padding: 0;
      text-align: center;
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
