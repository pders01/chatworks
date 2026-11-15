import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repositoryStyles } from "./styles.js";
import { emit } from "./contracts.js";
import { SourcePreviewController, type SourcePreviewState } from "./source-preview-controller.js";

/** Plaintext source reader. Annotation selection belongs to SourceAnnotationPanel, not this view. */
@customElement("cw-source-preview")
export class CwSourcePreview extends LitElement {
  @property({ attribute: false }) controller?: SourcePreviewController;
  @state() private copyStatus = "";
  private subscribed?: SourcePreviewController;
  private previous?: SourcePreviewState | null;
  private copySequence = 0;
  private readonly onChange = (): void => {
    this.requestUpdate();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this.subscribe();
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    this.subscribed?.removeEventListener("change", this.onChange);
    this.subscribed = undefined;
    ++this.copySequence;
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has("controller")) this.subscribe();
    const next = this.controller?.state;
    if (next?.file !== this.previous?.file || next?.status !== this.previous?.status) {
      this.copyStatus = "";
      ++this.copySequence;
    }
  }

  protected override updated(): void {
    const next = this.controller?.state;
    if (next?.file !== this.previous?.file || next?.status !== this.previous?.status) {
      const pane = this.renderRoot.querySelector<HTMLElement>(".scroll");
      if (pane) pane.scrollTop = next?.scrollTop ?? 0;
    }
    this.previous = next;
  }

  private subscribe(): void {
    if (!this.isConnected || this.subscribed === this.controller) return;
    this.subscribed?.removeEventListener("change", this.onChange);
    this.subscribed = this.controller;
    this.subscribed?.addEventListener("change", this.onChange);
  }

  private current(expected: SourcePreviewState, controller = this.controller): boolean {
    const state = controller?.state;
    return (
      this.isConnected &&
      controller === this.controller &&
      state?.file === expected.file &&
      state.status === expected.status
    );
  }

  private async copy(expected: SourcePreviewState): Promise<void> {
    if (!this.current(expected) || !expected.preview || expected.preview.binary) return;
    const sequence = ++this.copySequence,
      controller = this.controller;
    let message: string;
    try {
      await navigator.clipboard.writeText(expected.preview.content);
      message = expected.preview.truncated ? "Copied displayed preview" : "Copied file contents";
    } catch {
      message = "Copy unavailable";
    }
    if (sequence === this.copySequence && this.current(expected, controller))
      this.copyStatus = message;
  }

  override render() {
    const state = this.controller?.state;
    if (!state) return html`<p part="empty">Open a file to preview its source.</p>`;
    const preview = state.preview;
    return html`<section part="preview" aria-label="Source preview">
      <header part="header">
        <div>
          <strong>${state.file.path}</strong
          ><small>${state.file.repositoryId} · ${state.file.ref}</small>
        </div>
        <div class="actions" role="group" aria-label="Preview actions">
          <button
            type="button"
            @click=${() => {
              if (this.current(state)) emit(this, "cw:source-preview-close", state.file);
            }}
          >
            Back
          </button>
          <button
            type="button"
            ?disabled=${state.status === "loading"}
            @click=${() => {
              if (this.current(state)) void this.controller?.refresh();
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            aria-label=${preview?.truncated ? "Copy displayed preview" : "Copy file contents"}
            ?disabled=${state.status !== "ready" || preview?.binary || !preview}
            @click=${() => this.copy(state)}
          >
            Copy
          </button>
        </div>
      </header>
      <div
        class="scroll"
        part="scroll"
        @scroll=${(event: Event) => {
          if (this.current(state))
            this.controller?.rememberScroll((event.currentTarget as HTMLElement).scrollTop);
        }}
      >
        ${state.status === "loading" ? html`<p role="status">Loading source…</p>` : nothing}
        ${state.status === "error"
          ? html`<p role="alert" part="error">${state.error}</p>`
          : nothing}
        ${preview
          ? html`<p part="facts">
                ${preview.size === undefined ? "Size unavailable" : `${preview.size} bytes`} ·
                Read-only snapshot
              </p>
              ${preview.binary
                ? html`<p>Binary file. No text preview available.</p>`
                : html` ${preview.truncated
                      ? html`<p role="status">
                          Preview truncated. Copy includes only the displayed text.
                        </p>`
                      : nothing}
                    ${!preview.content ? html`<p>Empty text preview.</p>` : nothing}
                    <pre
                      tabindex="0"
                      role="document"
                      aria-label="File contents"
                      part="source"
                    ><code>${preview.content}</code></pre>`}`
          : nothing}
      </div>
      <p role="status" part="copy-status">${this.copyStatus}</p>
    </section>`;
  }

  static override styles = css`
    ${repositoryStyles}
    :host {
      display: block;
      min-width: 0;
      color: CanvasText;
      background: Canvas;
    }
    section {
      min-width: 0;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      padding: 0.75rem;
      border-bottom: 1px solid var(--cw-border-color);
    }
    header > div:not(.actions) {
      flex: 1 1 12rem;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex: 0 0 auto;
      gap: 0.5rem;
    }
    small {
      display: block;
      color: var(--cw-muted-color);
      font-size: 0.8125rem;
    }
    button {
      min-height: 2.75rem;
      font: inherit;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }
    .scroll {
      box-sizing: border-box;
      max-height: var(--cw-source-preview-height, 30rem);
      overflow: auto;
      padding: 0.75rem;
    }
    pre {
      margin: 0;
      padding: 0.75rem;
      white-space: pre;
      overflow: auto;
      border: 1px solid var(--cw-border-color);
      border-radius: 0.5rem;
      background: color-mix(in srgb, CanvasText 2%, Canvas);
      font:
        0.875rem/1.6 ui-monospace,
        monospace;
    }
    p {
      margin: 0.5rem 0;
      overflow-wrap: anywhere;
    }
    [part="copy-status"] {
      padding-inline: 0.75rem;
      min-height: 1.5em;
    }
    :focus-visible {
      outline: 2px solid var(--cw-repository-accent);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-source-preview": CwSourcePreview;
  }
}
