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
  type SplitDiffRow,
} from "../lib/diff.js";
import { highlight } from "../lib/highlight.js";
import "./loading-indicator.js";
import { browserStyles } from "../styles.js";

/**
 * Transport-independent unified diff renderer.
 *
 * Consumers own fetching and pass a complete patch through `rawDiff`.
 * The component parses patch semantics before rendering stable gutters,
 * optional host-provided highlighting, word-level changes, and a split layout.
 */
@customElement("cw-diff-view")
export class CwDiffView extends LitElement {
  @property({ type: String }) rawDiff = "";
  @property({ type: Boolean }) split = false;
  @property({ type: Boolean, reflect: true }) wrap = false;
  @property({ type: Boolean, attribute: "show-metadata" }) showMetadata = false;
  /** True when the host stopped fetching before the complete patch was returned. */
  @property({ type: Boolean }) truncated = false;
  @property({ type: String }) emptyLabel = "no changes";
  /** Accessible name for the focusable diff scroller. */
  @property({ type: String }) label = "Code changes";

  @state() private phase: "empty" | "loading" | "ready" | "error" = "empty";
  @state() private rendered = "";
  @state() private parsed: ParsedDiff = { files: [] };
  @state() private highlightedLines: string[] = [];
  @state() private error = "";
  private generation = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.highlight();
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
    if (this.phase === "error") return html`<p class="error" part="error">${this.error}</p>`;
    if (this.phase === "empty" || !this.rendered) {
      return html`<div class="empty" part="empty">${this.emptyLabel}</div>`;
    }
    return html`
      <div class="viewport" part="viewport" role="region" aria-label=${this.label} tabindex="0">
        ${this.truncated
          ? html`<div class="truncated" part="truncated" role="status">
              Diff preview truncated. Remaining changes are not shown.
            </div>`
          : nothing}
        ${this.split ? this.renderSplit() : this.renderUnified()}
      </div>
    `;
  }

  private renderSplit(): TemplateResult {
    const hasBinaryFile = this.parsed.files.some((file) => file.binary);
    if (!hasBinaryFile) {
      return html`<div class="diff split" part="diff split">
        ${this.renderSplitTable(this.rendered)}
      </div>`;
    }

    return html`<div class="diff split mixed-split" part="diff split">
      ${this.parsed.files.map((file, index) =>
        file.binary
          ? this.renderFile(file, true)
          : html`<section class="file split-file" part="file">
              ${filePath(file)
                ? html`<div class="file-label" part="file-label">${filePath(file)}</div>`
                : nothing}
              ${this.renderSplitTable(
                sliceRenderedDiff(
                  this.rendered,
                  firstSourceIndex(file),
                  firstSourceIndex(this.parsed.files[index + 1]),
                ),
              )}
            </section>`,
      )}
    </div>`;
  }

  private renderSplitTable(rendered: string): TemplateResult {
    return html`<table>
      <colgroup>
        <col />
        <col />
      </colgroup>
      <tbody>
        ${splitDiffHtml(rendered).map(
          (row) => html`
            <tr>
              ${this.renderSplitSide("old", row)} ${this.renderSplitSide("new", row)}
            </tr>
          `,
        )}
      </tbody>
    </table>`;
  }

  private renderSplitSide(side: "old" | "new", row: SplitDiffRow): TemplateResult {
    const content = side === "old" ? row.left : row.right;
    const kind = side === "old" ? row.leftKind : row.rightKind;
    const counterpartKind = side === "old" ? row.rightKind : row.leftKind;
    // Tokens: structural `side old|new`, then a change kind on real edited
    // lines, or `filler` when this side is empty padding opposite a change.
    const tokens = kind
      ? `side ${side} ${kind}`
      : !content && counterpartKind
        ? `side ${side} filler`
        : `side ${side}`;
    return html`<td class=${tokens} part=${tokens}>${content ? unsafeHTML(content) : nothing}</td>`;
  }

  private renderUnified(): TemplateResult {
    const multipleFiles = this.parsed.files.length > 1;
    return html`<div class="diff unified" part="diff unified">
      ${this.parsed.files.map((file) => this.renderFile(file, multipleFiles))}
    </div>`;
  }

  private renderFile(file: ParsedDiffFile, showFileLabel: boolean): TemplateResult {
    const visibleMetadata = file.binary
      ? metadataBeforeBinaryPayload(file.metadata)
      : file.metadata;
    const metadata = this.showMetadata
      ? visibleMetadata
      : visibleMetadata.filter(
          ({ content }) => !isBoilerplateMetadata(content) && !isBinaryMetadata(content),
        );
    const path = file.newPath || file.oldPath;
    return html`<section class="file" part="file">
      ${(showFileLabel || file.binary) && path
        ? html`<div class="file-label" part="file-label">${path}</div>`
        : nothing}
      ${metadata.map(
        (line) => html`<div class="metadata" part="metadata">
          <code>${this.lineHtml(line.sourceIndex, line.content)}</code>
        </div>`,
      )}
      ${file.binary
        ? html`<div class="file-state binary" part="file-state binary">
            <strong>Binary file changed</strong>
            <span>No text preview is available for this file.</span>
          </div>`
        : file.hunks.map((hunk) => this.renderHunk(hunk))}
      ${!file.binary && file.hunks.length === 0 && metadata.length === 0
        ? html`<div class="no-text-change" part="no-text-change">no textual changes</div>`
        : nothing}
    </section>`;
  }

  private renderHunk(hunk: ParsedDiffHunk): TemplateResult {
    const oldRange = formatRange(hunk.oldStart, hunk.oldCount);
    const newRange = formatRange(hunk.newStart, hunk.newCount);
    return html`<section class="hunk-section" part="hunk-section">
      <div class="hunk" part="hunk">
        <span class="hunk-range" part="hunk-range">${oldRange} → ${newRange}</span>
        <span class="hunk-context" part="hunk-context">${hunk.context || "changed lines"}</span>
      </div>
      ${hunk.lines.map((line) => this.renderLine(line))}
    </section>`;
  }

  private renderLine(line: ParsedDiffLine): TemplateResult {
    const marker = line.kind === "addition" ? "+" : line.kind === "deletion" ? "−" : "";
    return html`<div class="line ${line.kind}" part="line ${line.kind}">
      <span class="gutter old-line" part="gutter old-line">${line.oldLine ?? ""}</span>
      <span class="gutter new-line" part="gutter new-line">${line.newLine ?? ""}</span>
      <span class="marker" part="marker ${line.kind}-marker" aria-hidden="true">${marker}</span>
      <code class="code" part="code">${this.lineHtml(line.sourceIndex, line.content)}</code>
    </div>`;
  }

  private lineHtml(sourceIndex: number, fallback: string) {
    const highlighted = this.highlightedLines[sourceIndex];
    return highlighted === undefined ? fallback : unsafeHTML(highlighted);
  }

  static override styles = css`
    ${browserStyles}
    :host {
      display: block;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    .error {
      margin: 0;
      padding: var(--space-4, 1rem);
    }
    .empty,
    .no-text-change {
      display: grid;
      min-height: 8rem;
      place-items: center;
    }
    .truncated {
      position: sticky;
      top: 0;
      left: 0;
      z-index: 3;
      width: 100%;
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      box-sizing: border-box;
      border-block-end: 1px solid var(--cw-border-color);
      background: Canvas;
      color: var(--cw-muted-color);
      font-family: system-ui, sans-serif;
    }
    .file-state {
      position: sticky;
      left: 0;
      display: grid;
      min-height: 8rem;
      place-content: center;
      gap: var(--space-1, 0.25rem);
      padding: var(--space-4, 1rem);
      box-sizing: border-box;
      text-align: center;
      font-family: system-ui, sans-serif;
    }
    .file-state span {
      color: var(--cw-muted-color);
    }
    .viewport {
      width: 100%;
      height: 100%;
      min-height: 0;
      overflow: auto;
      box-sizing: border-box;
    }
    .viewport:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -2px;
    }
    .unified {
      width: max-content;
      min-width: 100%;
    }
    :host([wrap]) .unified {
      width: 100%;
    }
    .file-label {
      position: sticky;
      left: 0;
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border-block-end: 1px solid var(--cw-border-color);
      background: Canvas;
      font-weight: 650;
    }
    .metadata {
      position: sticky;
      left: 0;
      width: max-content;
      min-width: 100%;
      padding: 0.18rem var(--space-4, 1rem) 0.18rem calc(10ch + 1.5rem + var(--space-3, 0.75rem));
      box-sizing: border-box;
    }
    .metadata code {
      white-space: pre;
    }
    .hunk-section + .hunk-section {
      margin-top: var(--space-2, 0.5rem);
    }
    .hunk {
      position: sticky;
      left: 0;
      display: flex;
      width: max-content;
      min-width: 100%;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      box-sizing: border-box;
      background: ButtonFace;
    }
    .hunk-range {
      flex: none;
    }
    .hunk-context {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .line {
      display: grid;
      grid-template-columns: 5ch 5ch 1.5rem max-content;
      width: 100%;
      min-height: 1.75em;
      box-sizing: border-box;
    }
    :host([wrap]) .line {
      grid-template-columns: 5ch 5ch 1.5rem minmax(0, 1fr);
    }
    .gutter,
    .marker {
      position: sticky;
      z-index: 1;
      display: block;
      padding: 0.12rem var(--space-2, 0.5rem);
      box-sizing: border-box;
      user-select: none;
    }
    .gutter {
      text-align: right;
    }
    .old-line {
      left: 0;
    }
    .new-line {
      left: 5ch;
    }
    .marker {
      left: 10ch;
      padding-right: 0;
      padding-left: 0;
      text-align: center;
    }
    .code {
      display: block;
      min-width: 0;
      padding: 0.12rem var(--space-4, 1rem) 0.12rem var(--space-3, 0.75rem);
      white-space: pre;
    }
    :host([wrap]) .code {
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .ln-old,
    .ln-new {
      display: inline-block;
      min-width: 3ch;
      padding-right: var(--space-2, 0.5rem);
      text-align: right;
      user-select: none;
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
    .mixed-split > .file + .file {
      border-block-start: 1px solid var(--cw-border-color);
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
      padding: 2px var(--space-3, 0.75rem);
      vertical-align: top;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .side.old .ln-new,
    .side.new .ln-old {
      visibility: hidden;
    }
  `;
}

function filePath(file: ParsedDiffFile): string {
  return file.newPath || file.oldPath;
}

function firstSourceIndex(file: ParsedDiffFile | undefined): number | undefined {
  if (!file) return undefined;
  return file.metadata[0]?.sourceIndex ?? file.hunks[0]?.sourceIndex;
}

function sliceRenderedDiff(rendered: string, start = 0, end?: number): string {
  const container = document.createElement("div");
  container.innerHTML = rendered;
  const lines = Array.from(container.querySelectorAll("code .line"));
  const selected = lines
    .slice(start, end)
    .map((line) => line.outerHTML)
    .join("");
  return `<code>${selected}</code>`;
}

function isBoilerplateMetadata(line: string): boolean {
  return /^(diff --git |index |--- |\+\+\+ )/.test(line);
}

function isBinaryMetadata(line: string): boolean {
  return (
    line === "GIT binary patch" ||
    /^Binary files .+ and .+ differ$/.test(line) ||
    /^Binary file .+ has changed$/.test(line)
  );
}

function metadataBeforeBinaryPayload(
  metadata: ParsedDiffFile["metadata"],
): ParsedDiffFile["metadata"] {
  const payloadStart = metadata.findIndex(({ content }) => content === "GIT binary patch");
  return payloadStart < 0 ? metadata : metadata.slice(0, payloadStart + 1);
}

function formatRange(start: number, count: number): string {
  return count === 1 ? String(start) : `${start}–${start + Math.max(0, count - 1)}`;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-diff-view": CwDiffView;
  }
}
