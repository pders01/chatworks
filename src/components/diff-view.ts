import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { addLineNumbers, highlightWordDiffs, splitDiffHtml } from "../lib/diff.js";
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
 * The component adds Shiki highlighting, old/new line numbers,
 * word-level changes, and an optional side-by-side layout.
 */
@customElement("cw-diff-view")
export class CwDiffView extends LitElement {
  @property({ type: String }) rawDiff = "";
  @property({ type: Boolean }) split = false;
  @property({ type: String }) emptyLabel = "no changes";

  @state() private phase: "empty" | "loading" | "ready" | "error" = "empty";
  @state() private rendered = "";
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
      this.error = "";
      return;
    }
    this.phase = "loading";
    this.error = "";
    try {
      const { highlight } = await loadHighlight();
      let rendered = await highlight(rawDiff, "diff");
      if (generation !== this.generation || rawDiff !== this.rawDiff) return;
      rendered = highlightWordDiffs(rendered);
      rendered = addLineNumbers(rendered);
      this.rendered = rendered;
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
    if (!this.split) return html`<div class="diff unified">${unsafeHTML(this.rendered)}</div>`;

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
    .empty {
      display: grid;
      min-height: 8rem;
      place-items: center;
      color: var(--text-muted, var(--text));
      font-size: var(--text-xs);
      font-style: italic;
    }
    .diff {
      min-width: max-content;
      font-size: var(--text-xs);
      line-height: 1.55;
    }
    .diff pre {
      margin: 0;
      padding: var(--space-3) var(--space-4);
    }
    .diff .shiki {
      background: transparent !important;
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
      opacity: 0.32;
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

declare global {
  interface HTMLElementTagNameMap {
    "cw-diff-view": CwDiffView;
  }
}
