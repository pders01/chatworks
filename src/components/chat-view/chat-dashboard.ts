import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { consume } from "@lit/context";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { chatHostContext, repoHostContext, type ChatHost, type RepoHost } from "../../host.js";
import "./../../components/loading-indicator.js";

// Lazy-import markdown because it pulls the parser and code pipeline. A static
// import here defeats the dynamic imports in
// chat-view.ts and kb-view.ts — vite warns "dynamic import will not
// move module into another chunk" because the module is already in
// the main bundle. Sharing the lazy pattern keeps the dashboard off
// the cold-start chunk for users who haven't opened a chat yet.
let markdownModule: Promise<typeof import("../../lib/markdown.js")> | null = null;
function loadMarkdown() {
  if (!markdownModule) markdownModule = import("../../lib/markdown.js");
  return markdownModule;
}

@customElement("cw-chat-dashboard")
export class GcChatDashboard extends LitElement {
  @consume({ context: repoHostContext, subscribe: true })
  private repoHost?: RepoHost;
  @consume({ context: chatHostContext, subscribe: true })
  private chatHost!: ChatHost;

  @property({ type: String }) repoId = "";

  @state() private activitySummary = "";
  // Rendered HTML from activitySummary via marked. Lets the backend
  // fallback "Recent commits:\n- sha subject\n..." become a real <ul>
  // instead of a wall of text whose newlines collapse inside a <p>.
  @state() private activityHtml = "";
  @state() private summaryLoading = false;
  private cachedSummaryKey = "";
  @state() private suggestions: Array<{ label: string; prompt: string }> = [];

  override updated(changed: Map<string, unknown>) {
    if (changed.has("repoId") && this.repoId && this.repoHost) {
      void this.loadDashboard();
    }
  }

  private async loadDashboard() {
    const repoHost = this.repoHost;
    if (!repoHost) return;
    // 1. Suggestions from commits — instant, no LLM.
    try {
      const commits = await repoHost.listCommits({
        repoId: this.repoId,
        limit: 5,
        offset: 0,
      });
      const sug: Array<{ label: string; prompt: string }> = [];
      sug.push({ label: "overview", prompt: "What is this project about?" });
      if (commits.commits.length > 0) {
        const latest = commits.commits[0];
        sug.push({
          label: "latest",
          prompt: `What changed in commit ${latest.shortSha} ("${latest.message}")?`,
        });
      }
      if (commits.commits.length > 2) {
        sug.push({
          label: "recent",
          prompt: "What areas of the codebase have been worked on recently?",
        });
      }
      this.suggestions = sug.slice(0, 3);
    } catch {
      this.suggestions = [{ label: "overview", prompt: "What is this project about?" }];
    }

    // 2. LLM summary — cached by HEAD SHA, only re-fetch on new commits.
    try {
      const repos = await repoHost.listRepos({});
      const repo = repos.repos.find((r) => r.id === this.repoId);
      const headSha = repo?.headCommit ?? "";
      const cacheKey = `${this.repoId}:${headSha}`;
      if (cacheKey === this.cachedSummaryKey && this.activitySummary) return;

      this.summaryLoading = true;
      const resp = await this.chatHost.summarizeActivity({ repoId: this.repoId });
      this.activitySummary = resp.summary || "";
      if (this.activitySummary) {
        const { renderMarkdown } = await loadMarkdown();
        this.activityHtml = await renderMarkdown(this.activitySummary);
      } else {
        this.activityHtml = "";
      }
      this.cachedSummaryKey = cacheKey;
    } catch {
      this.activitySummary = "";
      this.activityHtml = "";
    } finally {
      this.summaryLoading = false;
    }
  }

  private prefillExample(text: string) {
    this.dispatchEvent(
      new CustomEvent("gc:prefill-example", {
        bubbles: true,
        composed: true,
        detail: { text },
      }),
    );
  }

  override render() {
    return html`
      <div class="empty-chat" part="empty-chat">
        <slot name="empty-state">
          <div class="empty-title" part="empty-title">ready when you are</div>
          <p class="empty-sub" part="empty-sub">
            ask about the repo — use <code>@path/to/file</code> to include file contents
          </p>
        </slot>

        ${this.suggestions.length > 0
          ? html`
              <div class="empty-examples" part="empty-examples">
                ${this.suggestions.map(
                  (s) => html`
                    <button
                      class="example"
                      part="example"
                      @click=${() => this.prefillExample(s.prompt)}
                    >
                      <span class="example-head" part="example-head">${s.label}</span>
                      <span class="example-body" part="example-body"
                        >${s.prompt.split("\n")[0].slice(0, 80)}</span
                      >
                    </button>
                  `,
                )}
              </div>
            `
          : nothing}
        ${this.summaryLoading || this.activityHtml
          ? html`
              <div class="recent-activity" part="recent-activity">
                <div class="recent-title" part="recent-title">recent activity</div>
                ${this.summaryLoading
                  ? html`<p class="activity-text loading" part="activity-text loading">
                      <cw-spinner></cw-spinner>
                      summarizing recent changes…
                    </p>`
                  : html`<div class="activity-text" part="activity-text">
                      ${unsafeHTML(this.activityHtml)}
                    </div>`}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: block;
    }
    .empty-chat {
      max-width: var(--content-max-width, 52rem);
      margin: 4rem auto 0;
      text-align: center;
    }
    .empty-title {
      margin-bottom: var(--space-2, 0.5rem);
    }
    .empty-sub {
      margin: 0 0 var(--space-7, 2rem);
    }
    .empty-sub code {
      padding: 0.08em 0.4em;
    }
    .empty-examples {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.55rem;
      text-align: left;
    }
    .example {
      padding: var(--space-3, 0.75rem) 0.95rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 0.25rem);
      text-align: left;
    }
    .example-body {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .recent-activity {
      margin-top: var(--space-4, 1rem);
      text-align: left;
    }
    .recent-title {
      margin-bottom: var(--space-2, 0.5rem);
    }
    .activity-text {
      margin: 0;
    }
    /* Markdown-rendered content: lists get bullets, paragraphs get
       spacing. Keep typography muted so the list doesn't compete with
       the suggestion cards above. */
    .activity-text :is(ul, ol) {
      margin: var(--space-1, 0.25rem) 0;
      padding-left: 1.3em;
    }
    .activity-text li {
      margin: 0.1em 0;
    }
    .activity-text p {
      margin: 0.3em 0;
    }
    .activity-text code {
      padding: 0 0.25em;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-chat-dashboard": GcChatDashboard;
  }
}
