import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { repositoryStyles } from "./styles.js";
import { repeat } from "lit/directives/repeat.js";
import {
  copyScope,
  emit,
  messageOf,
  sameScope,
  validScope,
  type FileIdentity,
  type RepositoryEntry,
  type RepositoryScope,
  type RepositoryTreeClient,
} from "./contracts.js";

export const REPOSITORY_TREE_CHILD_LIMIT = 100;
export const REPOSITORY_TREE_ROW_LIMIT = 500;
export const REPOSITORY_TREE_DEPTH_LIMIT = 12;

type Branch = {
  entry: RepositoryEntry;
  depth: number;
  status: "idle" | "loading" | "ready" | "error";
  children: Branch[];
  notice: string;
  error: string;
};
type Context = { sequence: number; client: RepositoryTreeClient; scope: RepositoryScope };

/** Lazy native disclosure/list composition, deliberately NOT an ARIA tree widget. */
@customElement("cw-repository-tree")
export class CwRepositoryTree extends LitElement {
  @property({ attribute: false }) client?: RepositoryTreeClient;
  @property({ attribute: false }) scope?: RepositoryScope;
  private root = this.makeRoot();
  private context?: Context;
  private sequence = 0;
  private rows = 0;
  private readonly requests = new Set<AbortController>();

  private makeRoot(): Branch {
    return {
      entry: { path: "", name: "Repository", kind: "directory" },
      depth: 0,
      status: "idle",
      children: [],
      notice: "",
      error: "",
    };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.requestUpdate("client");
  }

  override disconnectedCallback(): void {
    this.invalidate();
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has("client") || changed.has("scope")) this.refresh();
  }

  /** Explicitly discard cached disclosures and re-read the same immutable snapshot. */
  refresh(): void {
    this.invalidate();
    this.root = this.makeRoot();
    this.rows = 0;
    if (this.isConnected && this.client && validScope(this.scope)) {
      this.context = { sequence: this.sequence, client: this.client, scope: copyScope(this.scope) };
      void this.load(this.root, this.context);
    }
    this.requestUpdate();
  }

  private invalidate(): void {
    ++this.sequence;
    this.context = undefined;
    for (const abort of this.requests) abort.abort();
    this.requests.clear();
  }

  private current(context: Context): boolean {
    return (
      this.isConnected &&
      context.sequence === this.sequence &&
      context.client === this.client &&
      sameScope(context.scope, this.scope)
    );
  }

  private async load(branch: Branch, context: Context): Promise<void> {
    if (!this.current(context) || branch.status === "loading" || branch.status === "ready") return;
    branch.status = "loading";
    branch.error = "";
    this.requestUpdate();
    const abort = new AbortController();
    this.requests.add(abort);
    try {
      const result = await context.client.children(context.scope, branch.entry.path, {
        limit: REPOSITORY_TREE_CHILD_LIMIT,
        signal: abort.signal,
      });
      if (!this.current(context)) return;
      if (result.ref !== context.scope.ref) throw new Error("Tree returned a different snapshot.");
      const prefix = branch.entry.path ? `${branch.entry.path}/` : "";
      const count = Math.min(REPOSITORY_TREE_CHILD_LIMIT, REPOSITORY_TREE_ROW_LIMIT - this.rows);
      const entries = result.entries.slice(0, count);
      const paths = new Set<string>();
      // Bound processing before validating visible identities. Unshown entries
      // cannot acquire DOM identity or force an unbounded validation walk.
      for (const entry of entries) {
        const tail = entry.path.slice(prefix.length);
        if (
          !entry.path.startsWith(prefix) ||
          !tail ||
          tail.includes("/") ||
          paths.has(entry.path)
        ) {
          throw new Error("Tree returned duplicate or non-child paths.");
        }
        paths.add(entry.path);
      }
      branch.children = entries.map((entry) => ({
        entry: Object.freeze({ ...entry }),
        depth: branch.depth + 1,
        status: "idle",
        children: [],
        notice: "",
        error: "",
      }));
      this.rows += branch.children.length;
      branch.notice = [
        result.truncated || result.entries.length > count
          ? "More entries exist; listing truncated."
          : "",
        result.incomplete ? "Listing budget reached; results may be incomplete." : "",
      ]
        .filter(Boolean)
        .join(" ");
      branch.status = "ready";
    } catch (error) {
      if (!this.current(context)) return;
      branch.status = "error";
      branch.error = messageOf(error);
    } finally {
      this.requests.delete(abort);
    }
    if (this.current(context)) this.requestUpdate();
  }

  private openFile(branch: Branch, context: Context): void {
    if (!this.current(context)) return;
    emit<FileIdentity>(
      this,
      "cw:file-open",
      Object.freeze({ ...context.scope, path: branch.entry.path }),
    );
  }

  private status(branch: Branch, context: Context): TemplateResult {
    return html`${branch.status === "loading" ? html`<p role="status">Loading…</p>` : nothing}
    ${branch.status === "error"
      ? html`<p role="alert">${branch.error}</p>
          <button type="button" @click=${() => this.load(branch, context)}>Retry listing</button>`
      : nothing}
    ${branch.notice ? html`<p part="notice">${branch.notice}</p>` : nothing}
    ${branch.status === "ready" && !branch.children.length && !branch.notice
      ? html`<p>Empty directory.</p>`
      : nothing}`;
  }

  private renderChildren(branch: Branch, context: Context): TemplateResult {
    return html`<ul>
      ${repeat(
        branch.children,
        (child) =>
          JSON.stringify([
            context.sequence,
            context.scope.repositoryId,
            context.scope.ref,
            child.entry.path,
          ]),
        (child) => html`<li>
          ${child.entry.kind === "file"
            ? html`<button
                type="button"
                part="file"
                title=${child.entry.path}
                @click=${() => this.openFile(child, context)}
              >
                ${child.entry.name}
              </button>`
            : html` <details
                @toggle=${(event: Event) => {
                  if (
                    (event.currentTarget as HTMLDetailsElement).open &&
                    child.depth < REPOSITORY_TREE_DEPTH_LIMIT &&
                    this.rows < REPOSITORY_TREE_ROW_LIMIT
                  )
                    void this.load(child, context);
                }}
              >
                <summary part="directory" title=${child.entry.path}>${child.entry.name}</summary>
                ${child.depth >= REPOSITORY_TREE_DEPTH_LIMIT
                  ? html`<p>Depth limit reached.</p>`
                  : child.status === "idle" && this.rows >= REPOSITORY_TREE_ROW_LIMIT
                    ? html`<p>Browser row limit reached. Use file search.</p>`
                    : html` ${this.status(child, context)}${this.renderChildren(child, context)}`}
              </details>`}
        </li>`,
      )}
    </ul>`;
  }

  override render() {
    const context = this.context;
    return html`<nav part="tree" aria-label="Repository files">
      <header>
        <strong>Files</strong><button type="button" @click=${this.refresh}>Refresh listing</button>
      </header>
      <small>${this.scope?.repositoryId} · ${this.scope?.ref}</small>
      ${context
        ? html`${this.status(this.root, context)}${this.renderChildren(this.root, context)}`
        : html`<p>Choose a repository snapshot.</p>`}
    </nav>`;
  }

  static override styles = css`
    ${repositoryStyles}
    :host {
      display: block;
      min-width: 0;
      color: CanvasText;
      background: Canvas;
    }
    nav {
      border: 1px solid var(--cw-border-color);
      border-radius: 0.75rem;
      padding: 0.75rem;
      max-height: var(--cw-repository-tree-height, 30rem);
      overflow: auto;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      justify-content: space-between;
    }
    small {
      display: block;
      overflow-wrap: anywhere;
      color: var(--cw-muted-color);
      font-size: 0.8125rem;
      margin-block: 0.25rem 0.75rem;
    }
    ul {
      list-style: none;
      margin: 0;
      padding-left: 1rem;
    }
    nav > ul {
      padding-left: 0;
    }
    button,
    summary {
      min-height: 2.75rem;
      box-sizing: border-box;
      padding: 0.5rem;
      cursor: pointer;
      font: inherit;
      overflow-wrap: anywhere;
    }
    button {
      color: inherit;
      background: transparent;
      border: 1px solid var(--cw-border-color);
      max-width: 100%;
      text-align: left;
    }
    [part="file"] {
      background: transparent;
      color: CanvasText;
      border-color: transparent;
    }
    summary {
      border-radius: 0.375rem;
    }
    summary:hover {
      background: color-mix(in srgb, CanvasText 5%, Canvas);
    }
    p {
      margin: 0.5rem;
      overflow-wrap: anywhere;
    }
    :focus-visible {
      outline: 2px solid var(--cw-repository-accent);
      outline-offset: -2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-repository-tree": CwRepositoryTree;
  }
}
