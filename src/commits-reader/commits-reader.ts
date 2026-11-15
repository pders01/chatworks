import { LitElement, css, html, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { layoutGraph } from "../lib/commit-graph.js";
import type { CommitEntry } from "@jpahd/commits-core/contracts";
import "../components/diff-view.js";
import { componentPresentation } from "./presentation.js";
import {
  patchPresentation,
  structuredPatchSafe,
  type CommitsIntent,
  type CommitsIntentDetail,
  type CommitsLocation,
  type CommitsProvider,
  type ReaderAction,
} from "@jpahd/commits-core/contracts";
import { CommitsReaderState } from "@jpahd/commits-core/state";

/** Experimental read-only feature. The host supplies scope, location, appearance and intents. */
@customElement("portable-commits-reader")
export class PortableCommitsReader extends LitElement {
  @property({ attribute: false }) provider?: CommitsProvider;
  @property({ attribute: false }) location?: CommitsLocation;
  @property({ attribute: false }) actions: readonly ReaderAction[] = [];
  @property() instanceKey = "";
  @property({ type: Boolean }) exposed = false;
  @state() private filter = "";
  @state() private split = false;
  private readonly reader = new CommitsReaderState(() => this.requestUpdate());
  private listTop = 0;
  private detailTop = 0;
  private detailLeft = 0;
  private reconnecting = false;

  override connectedCallback(): void {
    super.connectedCallback();
    this.reader.attach();
    this.reconnecting = true;
    this.requestUpdate();
  }
  override disconnectedCallback(): void {
    this.reader.detach();
    super.disconnectedCallback();
  }
  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("provider") || changed.has("instanceKey")) {
      this.filter = "";
      this.split = false;
      this.listTop = this.detailTop = this.detailLeft = 0;
    }
    if (this.reconnecting || changed.has("provider") || changed.has("location")) {
      this.reconnecting = false;
      this.reader.configure(this.provider, this.location);
    }
  }
  protected override updated(changed: Map<string, unknown>): void {
    if (this.exposed && changed.has("exposed")) {
      const list = this.renderRoot.querySelector<HTMLElement>("ol");
      const detail = this.renderRoot.querySelector<HTMLElement>("article");
      if (list) list.scrollTop = this.listTop;
      if (detail) {
        detail.scrollTop = this.detailTop;
        detail.scrollLeft = this.detailLeft;
      }
    }
  }
  private emit(intent: CommitsIntent): void {
    const scope = this.reader.snapshot.scope;
    if (
      !this.isConnected ||
      !this.exposed ||
      !this.instanceKey ||
      !scope ||
      !this.reader.isBoundTo(this.provider) ||
      this.provider?.scope.key !== scope.key
    )
      return;
    this.dispatchEvent(
      new CustomEvent<CommitsIntentDetail>("commits-intent", {
        bubbles: true,
        composed: true,
        detail: Object.freeze({ instanceKey: this.instanceKey, scopeKey: scope.key, intent }),
      }),
    );
  }
  private navigate(patch: Partial<CommitsLocation>): void {
    const { location, revision } = this.reader.snapshot;
    if (!location) return;
    this.emit({
      kind: "location",
      location: Object.freeze({
        ...location,
        anchor: revision?.commit ?? location.anchor,
        ...patch,
      }),
    });
  }
  private remember(event: Event, part: "list" | "detail"): void {
    if (!this.exposed || !this.isConnected) return; // never record hidden zero-layout geometry
    const target = event.currentTarget as HTMLElement;
    if (part === "list") this.listTop = target.scrollTop;
    else {
      this.detailTop = target.scrollTop;
      this.detailLeft = target.scrollLeft;
    }
  }
  override render() {
    const s = this.reader.snapshot;
    return html`<div class="reader" ?hidden=${!this.exposed} .inert=${!this.exposed}>
      <header>
        <strong class="scope-label">${s.scope?.label ?? "Commits"}</strong>
        ${this.actions.includes("return")
          ? html`<button class="return" @click=${() => this.emit({ kind: "return" })}>
              <span aria-hidden="true">←</span> Return
            </button>`
          : nothing}
        ${!s.error || s.revision
          ? html`<label for="history-ref"
                >History ref
                <select
                  id="history-ref"
                  ?disabled=${!s.scope || s.loading || s.reloadRequired}
                  @change=${(event: Event) =>
                    this.navigate({
                      ref: (event.target as HTMLSelectElement).value,
                      anchor: undefined,
                      commit: undefined,
                    })}
                >
                  ${s.location && !s.refs.some((ref) => ref.selector === s.location!.ref)
                    ? html`<option value=${s.location.ref} .selected=${true}>
                        ${s.location.ref}
                      </option>`
                    : nothing}
                  ${s.refs.map(
                    (ref) =>
                      html`<option
                        value=${ref.selector}
                        .selected=${ref.selector === s.location?.ref}
                      >
                        ${ref.name} (${ref.kind})
                      </option>`,
                  )}
                </select></label
              >
              <button
                ?disabled=${!s.revision || s.loading || s.reloadRequired}
                @click=${() => {
                  if (!this.exposed || !this.reader.isBoundTo(this.provider)) return;
                  this.emit({ kind: "refresh" });
                  this.reader.refresh();
                }}
              >
                Refresh snapshot
              </button>`
          : nothing}
      </header>
      ${s.revision || s.location?.path !== undefined
        ? html`<div class="snapshot" role="status">
            ${s.revision
              ? html`<span class="pin"
                  >Pinned ${s.revision.requestedRef} at <code>${s.revision.commit}</code></span
                >`
              : nothing}
            ${s.location?.path !== undefined
              ? html`<span
                  >Exact-path history: <code>${s.location.path}</code>
                  <button @click=${() => this.navigate({ path: undefined })}>
                    All paths
                  </button></span
                >`
              : nothing}
          </div>`
        : nothing}
      ${!s.commits.length && (!s.revision || s.error)
        ? html`<section
            class=${`state-panel${s.error ? " error" : ""}`}
            role=${s.error ? "alert" : "status"}
          >
            <div class="state-content">
              <span class="eyebrow">Repository history</span>
              <h2>
                ${s.error
                  ? "Couldn't load commits"
                  : s.loading
                    ? "Loading commits…"
                    : "Choose a repository"}
              </h2>
              <p>
                ${s.error ||
                (s.loading
                  ? "Reading the selected repository. No agent or model is involved."
                  : "Select a workspace to browse its commits and changes.")}
              </p>
              ${s.error && !s.reloadRequired
                ? html`<button @click=${() => this.reader.retry()}>Retry</button>`
                : nothing}
            </div>
          </section>`
        : nothing}
      ${s.error && s.commits.length
        ? html`<p class="error error-inline" role="alert">
            ${s.error}
            ${!s.reloadRequired
              ? html`<button @click=${() => this.reader.retry()}>Retry</button>`
              : nothing}
          </p>`
        : nothing}
      <div
        class="layout"
        ?hidden=${!s.commits.length && (!s.revision || Boolean(s.error))}
        aria-busy=${s.loading}
      >
        <aside aria-label="Commit history">
          <label for="commit-filter"
            >Filter loaded commits<input
              id="commit-filter"
              type="search"
              placeholder="Search message, author or SHA"
              .value=${this.filter}
              @input=${(event: Event) => {
                this.filter = (event.target as HTMLInputElement).value;
              }}
          /></label>
          <ol role="list" @scroll=${(event: Event) => this.remember(event, "list")}>
            ${this.renderRows()}
          </ol>
          ${s.loading ? html`<p role="status">Loading history…</p>` : nothing}
          ${!s.loading && s.revision && !s.commits.length
            ? html`<p>No commits for this exact path.</p>`
            : nothing}
          ${s.hasMore
            ? html`<button
                ?disabled=${s.loading || s.reloadRequired}
                @click=${() => void this.reader.more()}
              >
                Load more
              </button>`
            : nothing}
          ${s.limitNotice ? html`<p role="status">${s.limitNotice}</p>` : nothing}
          <details class="history-help">
            <summary>About this history</summary>
            <p>Graph shows only visible rows; missing parents are not roots.</p>
          </details>
        </aside>
        <article
          aria-label="Commit details"
          tabindex="0"
          @scroll=${(event: Event) => this.remember(event, "detail")}
        >
          ${this.renderDetail()}
        </article>
      </div>
    </div>`;
  }
  private renderRows() {
    const query = this.filter.trim().toLowerCase();
    const commits = this.reader.snapshot.commits.filter(
      (commit) =>
        !query ||
        commit.message.toLowerCase().includes(query) ||
        commit.authorName.toLowerCase().includes(query) ||
        commit.sha.startsWith(query),
    );
    const graph = layoutGraph(commits);
    const rows = new Map(commits.map((commit, index) => [commit.sha, graph.nodes[index]]));
    return repeat(
      commits,
      (commit) => commit.sha,
      (commit, row) => {
        const node = graph.nodes[row];
        const width = (graph.maxLane + 1) * 12;
        const paths: string[] = [];
        for (const child of graph.nodes)
          for (const sha of child.parents) {
            const parent = rows.get(sha);
            const x = child.lane * 12 + 6;
            if (!parent) {
              if (child.row === row) paths.push(`M ${x} 22 L ${x} 44`);
              continue;
            }
            const px = parent.lane * 12 + 6;
            if (parent.row <= child.row) continue;
            if (row === child.row) paths.push(`M ${x} 22 L ${px} 44`);
            else if (row > child.row && row < parent.row) paths.push(`M ${px} 0 L ${px} 44`);
            else if (row === parent.row) paths.push(`M ${px} 0 L ${px} 22`);
          }
        return html`<li>
          <button
            aria-pressed=${this.reader.snapshot.selected?.sha === commit.sha}
            @click=${() => this.navigate({ commit: commit.sha })}
          >
            <svg
              aria-hidden="true"
              width=${Math.min(width, 120)}
              viewBox=${`0 0 ${width} 44`}
              preserveAspectRatio="none"
            >
              ${paths.map((d) => svg`<path d=${d}></path>`)}
              <circle cx=${node.lane * 12 + 6} cy="22" r="3"></circle>
            </svg>
            <span
              ><strong>${commit.message}</strong
              ><small>${commit.shortSha} · ${commit.authorName}</small></span
            >
          </button>
        </li>`;
      },
    );
  }
  private renderDetail() {
    const s = this.reader.snapshot;
    const commit = s.selected;
    return html` ${s.detailLoading ? html`<p role="status">Loading commit…</p>` : nothing}
    ${s.detailError
      ? html`<p class="error error-inline" role="alert">
          ${s.detailError}
          ${!s.reloadRequired
            ? html`<button @click=${() => this.reader.retryDetail()}>Retry detail</button>`
            : nothing}
        </p>`
      : nothing}
    ${commit
      ? this.renderMetadata(commit)
      : !s.detailLoading && !s.detailError
        ? html`<section class="detail-empty">
            <span class="eyebrow">Commit details</span>
            <h2>Select a commit</h2>
            <p>Choose a change from the history to read its message and diff.</p>
          </section>`
        : nothing}
    ${s.diff ? this.renderDiff() : nothing}`;
  }
  private renderMetadata(commit: CommitEntry) {
    return html`<h2 class="commit-title">${commit.message}</h2>
      <p class="commit-hash"><code>${commit.sha}</code></p>
      <p class="byline">
        ${commit.authorName} &lt;${commit.authorEmail}&gt; ·
        ${new Date(Number(commit.authorTime) * 1000).toISOString()}
      </p>
      <p class="stats" title="Backend-reported summary, not evidence that the patch is complete.">
        <span>Backend summary</span> ${commit.filesChanged} files
        <span class="additions">+${commit.additions}</span>
        <span class="deletions">−${commit.deletions}</span>
      </p>
      ${commit.body ? html`<pre class="body">${commit.body}</pre>` : nothing}
      <div class="actions" role="group" aria-label="Diff layout">
        <button
          aria-pressed=${!this.split}
          @click=${() => {
            this.split = false;
          }}
        >
          Unified
        </button>
        <button
          aria-pressed=${this.split}
          @click=${() => {
            this.split = true;
          }}
        >
          Split
        </button>
        ${this.actions.includes("explain")
          ? html`<button
              @click=${() =>
                this.emit({ kind: "explain", commit: commit.sha, subject: commit.message })}
            >
              Prepare explanation draft
            </button>`
          : nothing}
      </div>`;
  }
  private renderDiff() {
    const diff = this.reader.snapshot.diff!;
    const rendered = patchPresentation(diff.rawDiff);
    const structured = structuredPatchSafe(rendered.text);
    return html`<p>
        ${diff.base.kind === "empty-tree"
          ? "Root commit — compared with empty tree."
          : `First-parent diff — base ${diff.base.commit}`}
      </p>
      ${diff.completeness.kind === "partial"
        ? html`<p class="caution" role="status">
            Backend patch is partial: ${diff.completeness.reason}
          </p>`
        : diff.completeness.kind === "unknown"
          ? html`<p class="caution" role="status">
              Patch completeness is unknown; omissions/placeholders may be present.
            </p>`
          : nothing}
      ${rendered.clipped
        ? html`<p class="caution" role="status">
            Reader display limit: the prefix and a separate ending excerpt are shown; intervening
            text is omitted, not certified complete.
          </p>`
        : nothing}
      ${diff.files !== undefined
        ? html`<details>
            <summary>Changed-file evidence (${diff.files.length})</summary>
            <ul>
              ${diff.files.map(
                (file) =>
                  html`<li>
                    ${file.status}: ${file.path}${file.fromPath ? ` (from ${file.fromPath})` : ""}
                  </li>`,
              )}
            </ul>
          </details>`
        : nothing}
      ${diff.rawDiff
        ? html` ${!structured
              ? html`<p class="caution" role="status">
                  Structured diff work limit reached. Read the received patch as plain text below.
                </p>`
              : nothing}
            <details class="raw" .open=${!structured}>
              <summary>Received patch text (bounded display)</summary>
              <pre tabindex="0" role="document" aria-label="Received patch text">
${rendered.text}</pre
              >
            </details>
            ${rendered.tail !== undefined
              ? html`<details class="raw-tail" open>
                  <summary>Received patch ending (bounded text)</summary>
                  <pre tabindex="0" role="document" aria-label="Ending patch excerpt">
${rendered.tail}</pre
                  >
                </details>`
              : nothing}
            ${structured
              ? html`<cw-diff-view
                  .rawDiff=${rendered.text}
                  .split=${this.split}
                  .showMetadata=${true}
                ></cw-diff-view>`
              : nothing}`
        : html`<p>
            ${diff.empty === true
              ? "Backend reports an empty diff."
              : "No patch text supplied; this does not establish that nothing changed."}
          </p>`}`;
  }
  static override styles = css`
    ${componentPresentation}
    :host {
      display: block;
      height: 100%;
      min-width: 0;
      min-height: 0;
      color: var(--reader-text, #202722);
      background: var(--reader-surface, #fff);
      font: 14px/1.5 var(--reader-font, system-ui);
    }
    * {
      box-sizing: border-box;
    }
    .reader {
      height: 100%;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    .reader[hidden],
    .layout[hidden] {
      display: none;
    }
    header,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    header {
      min-height: 56px;
      padding: 10px 20px;
      border-bottom: 1px solid var(--reader-border, #dce1dc);
    }
    .scope-label {
      margin-right: auto;
      min-width: 0;
      overflow-wrap: anywhere;
      font-size: 13px;
      font-weight: 550;
    }
    header label {
      color: var(--reader-muted, #58665d);
      font-size: 12px;
    }
    label {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    input,
    select,
    button {
      min-height: 34px;
      max-width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--reader-border, #dce1dc);
      border-radius: 6px;
      color: inherit;
      background: var(--reader-control, #f8faf7);
      font: inherit;
      font-size: 13px;
    }
    button {
      appearance: none;
      cursor: pointer;
      font-weight: 500;
    }
    button:hover:not(:disabled),
    select:hover:not(:disabled) {
      background: var(--reader-selected, #eaf0eb);
    }
    button:disabled {
      cursor: default;
      opacity: 0.5;
    }
    .return {
      border-color: transparent;
      background: transparent;
    }
    :focus-visible {
      outline: 2px solid var(--reader-focus, #4e6b82);
      outline-offset: 2px;
    }
    code,
    pre {
      font-family: var(--reader-mono, monospace);
    }
    code,
    h1,
    h2,
    p,
    .snapshot,
    summary {
      overflow-wrap: anywhere;
    }
    .snapshot {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 20px;
      padding: 8px 20px;
      border-bottom: 1px solid var(--reader-border, #dce1dc);
      color: var(--reader-muted, #58665d);
      font-size: 12px;
    }
    .snapshot code {
      font-size: 11px;
    }
    .layout {
      display: grid;
      grid-template-columns: clamp(17rem, 28%, 25rem) minmax(0, 1fr);
      flex: 1;
      min-height: 0;
    }
    aside {
      min-height: 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 12px 12px;
      border-right: 1px solid var(--reader-border, #dce1dc);
      background: var(--reader-control, #f8faf7);
    }
    aside label {
      display: block;
      color: var(--reader-muted, #58665d);
      font-size: 12px;
      font-weight: 500;
    }
    input {
      display: block;
      width: 100%;
      margin-top: 6px;
      background: var(--reader-surface, #fff);
      font-weight: 400;
    }
    input::placeholder {
      color: var(--reader-muted, #58665d);
      opacity: 0.85;
    }
    .history-help {
      margin: 0 4px;
      color: var(--reader-muted, #58665d);
      font-size: 11px;
    }
    .history-help summary {
      cursor: pointer;
    }
    .history-help p {
      margin-bottom: 0;
    }
    ol {
      list-style: none;
      margin: 0 -12px;
      padding: 0 6px;
      overflow: auto;
      flex: 1;
      min-height: 0;
      scrollbar-width: thin;
    }
    li > button {
      display: flex;
      gap: 10px;
      align-items: center;
      width: 100%;
      min-height: 58px;
      padding: 6px 10px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      text-align: left;
    }
    li > button[aria-pressed="true"] {
      border-color: var(--reader-border, #dce1dc);
      background: var(--reader-selected, #eaf0eb);
    }
    li > button span {
      min-width: 0;
    }
    li strong {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 500;
    }
    small {
      display: block;
      margin-top: 3px;
      color: var(--reader-muted, #58665d);
      font-size: 11px;
      font-weight: 400;
    }
    svg {
      align-self: stretch;
      flex-shrink: 0;
      min-height: 44px;
      color: var(--reader-focus, #4e6b82);
    }
    svg path {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.25;
    }
    svg circle {
      fill: currentColor;
    }
    article {
      min-width: 0;
      min-height: 0;
      overflow: auto;
      padding: 24px 28px;
      scrollbar-width: thin;
    }
    .commit-title {
      max-width: 60ch;
      margin: 0 0 12px;
      font-size: 22px;
      line-height: 1.4;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    h2 {
      margin: 8px 0;
      color: var(--reader-text, #202722);
      font-size: 22px;
      line-height: 1.35;
      font-weight: 550;
      letter-spacing: -0.02em;
    }
    p {
      margin: 10px 0;
    }
    .byline,
    .commit-hash {
      color: var(--reader-muted, #58665d);
      font-size: 12px;
    }
    .commit-hash {
      margin: 0 0 8px;
    }
    .body {
      max-width: 80ch;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 14px/1.6 var(--reader-font, system-ui);
    }
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 12px;
    }
    .stats > span:first-child {
      color: var(--reader-muted, #58665d);
    }
    .additions {
      color: var(--reader-success, var(--reader-text, #2f8651));
    }
    .deletions {
      color: var(--reader-danger, #b64343);
    }
    .actions {
      margin: 18px 0 24px;
    }
    .actions button[aria-pressed="true"] {
      border-color: var(--reader-focus, #4e6b82);
      background: var(--reader-selected, #eaf0eb);
    }
    .raw pre,
    .raw-tail pre {
      overflow: auto;
      white-space: pre;
      font-size: 12px;
    }
    details {
      margin: 12px 0;
    }
    summary {
      cursor: pointer;
      color: var(--reader-muted, #58665d);
      font-size: 12px;
    }
    .state-panel {
      display: grid;
      place-items: center;
      flex: 1;
      min-height: 0;
      padding: 32px 24px;
      overflow: auto;
    }
    .state-content {
      width: min(100%, 30rem);
      padding-bottom: 10vh;
    }
    .eyebrow {
      color: var(--reader-muted, #58665d);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }
    .state-content p,
    .detail-empty p {
      max-width: 44ch;
      color: var(--reader-muted, #58665d);
      line-height: 1.7;
    }
    .state-content button {
      margin-top: 12px;
      min-width: 88px;
    }
    .state-panel.error .eyebrow {
      color: var(--reader-danger, #b64343);
    }
    .detail-empty {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      min-height: 70%;
      max-width: 30rem;
      margin: auto;
    }
    .error-inline {
      padding: 12px 16px;
      color: var(--reader-danger, #b64343);
      border-bottom: 1px solid var(--reader-border, #dce1dc);
    }
    .caution {
      padding: 10px 12px;
      border-left: 2px solid var(--reader-focus, #4e6b82);
      color: var(--reader-muted, #58665d);
      font-size: 12px;
    }
    cw-diff-view {
      display: block;
      height: auto;
      margin-top: 16px;
      color: inherit;
      font: 13px/1.5 var(--reader-mono, monospace);
    }
    cw-diff-view::part(viewport) {
      overflow: visible;
      border: 1px solid var(--reader-border, #dce1dc);
      border-radius: 6px;
    }
    cw-diff-view::part(diff) {
      font: 13px/1.6 var(--reader-mono, monospace);
    }
    cw-diff-view::part(file-label),
    cw-diff-view::part(hunk),
    cw-diff-view::part(metadata) {
      color: var(--reader-muted, #58665d);
      background: var(--reader-control, #f8faf7);
    }
    cw-diff-view::part(file-label) {
      color: var(--reader-text, #202722);
      border-bottom: 1px solid var(--reader-border, #dce1dc);
    }
    cw-diff-view::part(metadata) {
      padding-block: 2px;
      font-size: 11px;
    }
    cw-diff-view::part(hunk) {
      border-block: 1px solid var(--reader-border, #dce1dc);
      font-size: 12px;
    }
    cw-diff-view::part(gutter),
    cw-diff-view::part(marker) {
      color: var(--reader-muted, #58665d);
      background: inherit;
    }
    cw-diff-view::part(code) {
      color: var(--reader-text, #202722);
      background: transparent;
    }
    cw-diff-view::part(syntax-identifier) {
      color: var(--reader-text, #202722);
    }
    cw-diff-view::part(syntax-keyword) {
      color: var(--reader-syntax-keyword, var(--reader-text, #202722));
    }
    cw-diff-view::part(syntax-string) {
      color: var(--reader-syntax-string, var(--reader-text, #202722));
    }
    cw-diff-view::part(syntax-comment) {
      color: var(--reader-muted, #58665d);
    }
    cw-diff-view::part(addition) {
      background: var(--reader-add, #e1f0e4);
    }
    cw-diff-view::part(deletion) {
      background: var(--reader-del, #f8e7e7);
    }
    cw-diff-view::part(addition-marker) {
      color: var(--reader-success, var(--reader-text, #2f8651));
    }
    cw-diff-view::part(deletion-marker) {
      color: var(--reader-danger, #b64343);
    }
    cw-diff-view::part(word-add) {
      color: inherit;
      background: color-mix(in srgb, var(--reader-success, #2f8651) 22%, transparent);
    }
    cw-diff-view::part(word-del) {
      color: inherit;
      background: color-mix(in srgb, var(--reader-danger, #b64343) 22%, transparent);
    }
    cw-diff-view::part(old) {
      border-right: 1px solid var(--reader-border, #dce1dc);
    }
    @media (max-width: 700px) {
      header {
        gap: 8px;
        padding: 10px 12px;
      }
      .scope-label {
        flex-basis: 100%;
      }
      .snapshot {
        padding: 8px 12px;
      }
      .layout {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(160px, 40%) minmax(0, 1fr);
      }
      aside {
        gap: 8px;
        padding-top: 12px;
        border-right: 0;
        border-bottom: 1px solid var(--reader-border, #dce1dc);
      }
      article {
        padding: 18px 16px;
      }
      .commit-title {
        font-size: 19px;
      }
      .state-panel {
        padding: 24px;
      }
      .state-content {
        padding-bottom: 4vh;
      }
    }
  `;
}
declare global {
  interface HTMLElementTagNameMap {
    "portable-commits-reader": PortableCommitsReader;
  }
}
