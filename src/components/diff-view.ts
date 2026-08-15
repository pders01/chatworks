import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import {
  addLineNumbers,
  extractDiffLineHtml,
  highlightWordDiffs,
  parseUnifiedDiff,
  splitDiffHtml,
  type ParsedDiff,
  type ParsedDiffFile,
  type ParsedDiffHunk,
  type ParsedDiffLine,
} from "../lib/diff.js";
import * as settings from "../lib/settings.js";
import "./loading-indicator.js";

let highlightModule: Promise<typeof import("../lib/highlight.js")> | null = null;
function loadHighlight() {
  if (!highlightModule) highlightModule = import("../lib/highlight.js");
  return highlightModule;
}

/**
 * Transport-independent unified diff renderer.
 *
 * Consumers own fetching and pass a complete patch through `rawDiff`.
 * The component parses patch semantics before rendering stable gutters,
 * Shiki highlighting, word-level changes, and an optional split layout.
 */
@customElement("cw-diff-view")
export class CwDiffView extends LitElement {
  @property({ type: String }) rawDiff = "";
  @property({ type: Boolean }) split = false;
  @property({ type: Boolean, reflect: true }) wrap = false;
  @property({ type: Boolean, attribute: "show-metadata" }) showMetadata = false;
  @property({ type: String }) emptyLabel = "no changes";

  @state() private phase: "empty" | "loading" | "ready" | "error" = "empty";
  @state() private rendered = "";
  @state() private parsed: ParsedDiff = { files: [] };
  @state() private highlightedLines: string[] = [];
  @state() private error = "";
  private generation = 0;
  private unsubscribeSettings: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.unsubscribeSettings = settings.onChange(() => void this.highlight());
    void this.highlight();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("rawDiff") && changed.get("rawDiff") !== undefined) void this.highlight();
  }

  private async highlight(): Promise<void> {
    const generation = ++this.generation;
    const rawDiff = this.rawDiff;
    if (!rawDiff) {
      this.phase = "empty";
      this.rendered = "";
      this.parsed = { files: [] };
      this.highlightedLines = [];
      this.error = "";
      return;
    }

    this.phase = "loading";
    this.error = "";
    const parsed = parseUnifiedDiff(rawDiff);
    try {
      const { highlight } = await loadHighlight();
      let highlighted = await highlight(rawDiff, "diff");
      if (generation !== this.generation || rawDiff !== this.rawDiff) return;
      highlighted = highlightWordDiffs(highlighted);
      this.parsed = parsed;
      this.highlightedLines = extractDiffLineHtml(highlighted);
      this.rendered = addLineNumbers(highlighted);
      this.phase = "ready";
    } catch (error) {
      if (generation !== this.generation) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.phase = "error";
    }
  }

  override render() {
    if (this.phase === "loading") {
      return html`<cw-loading-banner heading="rendering diff…"></cw-loading-banner>`;
    }
    if (this.phase === "error") return html`<p class="error">${this.error}</p>`;
    if (this.phase === "empty" || !this.rendered) {
      return html`<div class="empty">${this.emptyLabel}</div>`;
    }
    if (!this.split) return this.renderUnified();

    return html`
      <div class="diff split">
        <table>
          <colgroup>
            <col />
            <col />
          </colgroup>
          <tbody>
            ${splitDiffHtml(this.rendered).map(
              ({ left, right }) => html`
                <tr>
                  <td class="side old">${left ? unsafeHTML(left) : nothing}</td>
                  <td class="side new">${right ? unsafeHTML(right) : nothing}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderUnified(): TemplateResult {
    const multipleFiles = this.parsed.files.length > 1;
    return html`<div class="diff unified">
      ${this.parsed.files.map((file) => this.renderFile(file, multipleFiles))}
    </div>`;
  }

  private renderFile(file: ParsedDiffFile, showFileLabel: boolean): TemplateResult {
    const metadata = this.showMetadata
      ? file.metadata
      : file.metadata.filter(({ content }) => !isBoilerplateMetadata(content));
    const path = file.newPath || file.oldPath;
    return html`<section class="file">
      ${showFileLabel && path ? html`<div class="file-label">${path}</div>` : nothing}
      ${metadata.map(
        (line) => html`<div class="metadata">
          <code>${this.lineHtml(line.sourceIndex, line.content)}</code>
        </div>`,
      )}
      ${file.hunks.map((hunk) => this.renderHunk(hunk))}
      ${file.hunks.length === 0 && metadata.length === 0
        ? html`<div class="no-text-change">no textual changes</div>`
        : nothing}
    </section>`;
  }

  private renderHunk(hunk: ParsedDiffHunk): TemplateResult {
    const oldRange = formatRange(hunk.oldStart, hunk.oldCount);
    const newRange = formatRange(hunk.newStart, hunk.newCount);
    return html`<section class="hunk-section">
      <div class="hunk">
        <span class="hunk-range">${oldRange} → ${newRange}</span>
        <span class="hunk-context">${hunk.context || "changed lines"}</span>
      </div>
      ${hunk.lines.map((line) => this.renderLine(line))}
    </section>`;
  }

  private renderLine(line: ParsedDiffLine): TemplateResult {
    const marker = line.kind === "addition" ? "+" : line.kind === "deletion" ? "−" : "";
    return html`<div class="line ${line.kind}">
      <span class="gutter old-line">${line.oldLine ?? ""}</span>
      <span class="gutter new-line">${line.newLine ?? ""}</span>
      <span class="marker" aria-hidden="true">${marker}</span>
      <code class="code">${this.lineHtml(line.sourceIndex, line.content)}</code>
    </div>`;
  }

  private lineHtml(sourceIndex: number, fallback: string) {
    const highlighted = this.highlightedLines[sourceIndex];
    return highlighted === undefined ? fallback : unsafeHTML(highlighted);
  }

  static override styles = css`
    :host {
      display: block;
      min-width: 0;
      min-height: 0;
      overflow: auto;
      color: var(--text);
      background: var(--surface-1);
      font-family: var(--font-mono, ui-monospace, monospace);
    }
    .error {
      margin: 0;
      padding: var(--space-4);
      color: var(--danger);
      font-size: var(--text-sm);
    }
    .empty,
    .no-text-change {
      display: grid;
      min-height: 8rem;
      place-items: center;
      color: var(--text-muted, var(--text));
      font-size: var(--text-xs);
      font-style: italic;
    }
    .diff {
      font-size: var(--diff-font-size, var(--text-sm, 0.75rem));
      line-height: 1.5;
    }
    .unified {
      width: max-content;
      min-width: 100%;
    }
    :host([wrap]) .unified {
      width: 100%;
    }
    .file + .file {
      border-top: 1px solid var(--border-default);
    }
    .file-label {
      position: sticky;
      left: 0;
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--border-default);
      color: var(--text-secondary, var(--text));
      background: var(--surface-1);
      font-weight: 600;
    }
    .metadata {
      position: sticky;
      left: 0;
      width: max-content;
      min-width: 100%;
      padding: 0.18rem var(--space-4) 0.18rem calc(10ch + 1.5rem + var(--space-3));
      color: var(--text-muted, var(--text));
      background: var(--surface-1);
      box-sizing: border-box;
    }
    .metadata code {
      white-space: pre;
    }
    .hunk-section + .hunk-section {
      margin-top: var(--space-2);
    }
    .hunk {
      position: sticky;
      left: 0;
      display: flex;
      width: max-content;
      min-width: 100%;
      gap: var(--space-3);
      padding: 0.36rem var(--space-3);
      border-top: 1px solid var(--border-default);
      border-bottom: 1px solid var(--border-default);
      color: var(--text-secondary, var(--text));
      background: var(--surface-2);
      box-sizing: border-box;
    }
    .hunk-range {
      flex: none;
      color: var(--text-accent, var(--text-secondary, var(--text)));
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .hunk-context {
      overflow: hidden;
      color: var(--text-muted, var(--text));
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .line {
      --line-bg: var(--surface-1);
      --gutter-bg: var(--surface-1);
      display: grid;
      grid-template-columns: 5ch 5ch 1.5rem max-content;
      width: 100%;
      min-height: 1.75em;
      border-left: 2px solid transparent;
      background: var(--line-bg);
      box-sizing: border-box;
    }
    :host([wrap]) .line {
      grid-template-columns: 5ch 5ch 1.5rem minmax(0, 1fr);
    }
    .line.addition {
      --line-bg: color-mix(in srgb, var(--success) 9%, var(--surface-1));
      --gutter-bg: color-mix(in srgb, var(--success) 14%, var(--surface-1));
      border-left-color: var(--success);
    }
    .line.deletion {
      --line-bg: color-mix(in srgb, var(--danger) 9%, var(--surface-1));
      --gutter-bg: color-mix(in srgb, var(--danger) 14%, var(--surface-1));
      border-left-color: var(--danger);
    }
    .line.notice {
      color: var(--text-muted, var(--text));
      font-style: italic;
    }
    .gutter,
    .marker {
      position: sticky;
      z-index: 1;
      display: block;
      padding: 0.12rem var(--space-2);
      background: var(--gutter-bg);
      box-sizing: border-box;
      user-select: none;
    }
    .gutter {
      color: var(--text-muted, var(--text));
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .old-line {
      left: 0;
    }
    .new-line {
      left: 5ch;
      border-right: 1px solid var(--border-default);
    }
    .marker {
      left: 10ch;
      padding-right: 0;
      padding-left: 0;
      color: var(--text-muted, var(--text));
      text-align: center;
    }
    .addition .marker {
      color: var(--success);
      font-weight: 700;
    }
    .deletion .marker {
      color: var(--danger);
      font-weight: 700;
    }
    .code {
      display: block;
      min-width: 0;
      padding: 0.12rem var(--space-4) 0.12rem var(--space-3);
      color: var(--text);
      background: var(--line-bg);
      white-space: pre;
    }
    :host([wrap]) .code {
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .diff mark.word-del {
      color: inherit;
      background: color-mix(in srgb, var(--danger) 38%, transparent);
      border-radius: 2px;
    }
    .diff mark.word-add {
      color: inherit;
      background: color-mix(in srgb, var(--success) 38%, transparent);
      border-radius: 2px;
    }
    .ln-old,
    .ln-new {
      display: inline-block;
      min-width: 3ch;
      padding-right: var(--space-2);
      text-align: right;
      opacity: 0.45;
      user-select: none;
      font-variant-numeric: tabular-nums;
    }
    .ln-old::before {
      content: attr(data-n);
    }
    .ln-new::before {
      content: attr(data-n);
    }
    .split {
      width: 100%;
      min-width: 720px;
    }
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }
    col {
      width: 50%;
    }
    .side {
      padding: 2px var(--space-3);
      vertical-align: top;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .side.old {
      background: color-mix(in srgb, var(--danger) 7%, transparent);
      border-right: 1px solid var(--border-default);
    }
    .side.new {
      background: color-mix(in srgb, var(--success) 7%, transparent);
    }
    .side.old .ln-new,
    .side.new .ln-old {
      visibility: hidden;
    }
  `;
}

function isBoilerplateMetadata(line: string): boolean {
  return /^(diff --git |index |--- |\+\+\+ )/.test(line);
}

function formatRange(start: number, count: number): string {
  return count === 1 ? String(start) : `${start}–${start + Math.max(0, count - 1)}`;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-diff-view": CwDiffView;
  }
}
