import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repositoryStyles } from "./styles.js";
import {
  copyScope,
  emit,
  messageOf,
  sameScope,
  validScope,
  type FileIdentity,
  type FileSearchClient,
  type RepositoryScope,
} from "./contracts.js";

export const FILE_PICKER_LIMIT = 100;
export const FILE_PICKER_DEBOUNCE_MS = 120;

type Context = {
  sequence: number;
  client: FileSearchClient;
  scope: RepositoryScope;
  query: string;
};

/** Bounded filename search. Native modal behavior; no manual focus trap. */
@customElement("cw-file-picker")
export class CwFilePicker extends LitElement {
  @property({ attribute: false }) client?: FileSearchClient;
  @property({ attribute: false }) scope?: RepositoryScope;
  @property({ type: Boolean, reflect: true }) open = false;
  @state() private query = "";
  @state() private paths: readonly string[] = [];
  @state() private selected = -1;
  @state() private loading = false;
  @state() private error = "";
  @state() private truncated = false;
  @state() private incomplete = false;
  private sequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  private result?: Context;

  override connectedCallback(): void {
    super.connectedCallback();
    // Also reschedule on reconnect when no reactive input changed.
    this.requestUpdate("client");
  }

  override disconnectedCallback(): void {
    this.invalidate();
    this.renderRoot.querySelector<HTMLDialogElement>("dialog")?.close();
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has("client") || changed.has("scope") || changed.has("open")) {
      this.invalidate();
      this.schedule();
    }
  }

  protected override updated(changed: PropertyValues): void {
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>("dialog");
    if (this.open && this.isConnected && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!this.open && dialog?.open) dialog.close();
    if (changed.has("selected"))
      this.renderRoot
        .querySelector(`#option-${this.selected}`)
        ?.scrollIntoView({ block: "nearest" });
  }

  private invalidate(): void {
    ++this.sequence;
    clearTimeout(this.timer);
    this.abort?.abort();
    this.result = undefined;
    this.paths = [];
    this.selected = -1;
    this.error = "";
    this.loading = false;
    this.truncated = this.incomplete = false;
  }

  private schedule(): void {
    if (!this.open || !this.isConnected || !this.client || !validScope(this.scope)) return;
    const context: Context = {
      sequence: this.sequence,
      client: this.client,
      scope: copyScope(this.scope),
      query: this.query,
    };
    this.loading = true;
    this.timer = setTimeout(() => {
      void this.search(context);
    }, FILE_PICKER_DEBOUNCE_MS);
  }

  private current(context: Context): boolean {
    return (
      this.isConnected &&
      this.open &&
      context.sequence === this.sequence &&
      this.client === context.client &&
      sameScope(this.scope, context.scope) &&
      this.query === context.query
    );
  }

  private async search(context: Context): Promise<void> {
    if (!this.current(context)) return;
    const abort = (this.abort = new AbortController());
    try {
      const result = await context.client.search(context.scope, context.query, {
        limit: FILE_PICKER_LIMIT,
        signal: abort.signal,
      });
      if (!this.current(context)) return;
      if (result.ref !== context.scope.ref)
        throw new Error("Search returned a different snapshot.");
      this.paths = [...new Set(result.paths.slice(0, FILE_PICKER_LIMIT))];
      this.selected = this.paths.length ? 0 : -1;
      this.truncated = result.truncated || result.paths.length > FILE_PICKER_LIMIT;
      this.incomplete = result.incomplete;
      this.result = context;
    } catch (error) {
      if (!this.current(context)) return;
      this.error = messageOf(error);
    } finally {
      if (this.current(context)) this.loading = false;
    }
  }

  private onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const query = input.value.slice(0, 128);
    input.value = query;
    if (query === this.query) return;
    this.query = query;
    this.invalidate();
    this.schedule();
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (this.paths.length)
        this.selected =
          (this.selected + (event.key === "ArrowDown" ? 1 : -1) + this.paths.length) %
          this.paths.length;
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.choose(this.selected);
    }
  }

  private choose(index: number): void {
    const context = this.result,
      path = this.paths[index];
    if (!context || path === undefined || this.loading || !this.current(context)) return;
    const identity: FileIdentity = Object.freeze({ ...context.scope, path });
    this.dismiss();
    emit<FileIdentity>(this, "cw:file-open", identity);
  }

  private dismiss(): void {
    this.open = false;
    this.invalidate();
    this.renderRoot.querySelector<HTMLDialogElement>("dialog")?.close();
    emit(this, "cw:file-picker-close", undefined);
  }

  override render() {
    return html`<dialog
      part="dialog"
      aria-labelledby="title"
      aria-describedby="context"
      @cancel=${(event: Event) => {
        event.preventDefault();
        this.dismiss();
      }}
    >
      <header part="header">
        <h2 id="title">Find file</h2>
        <button type="button" aria-label="Close file search" @click=${this.dismiss}>×</button>
      </header>
      <p id="context">Snapshot <code>${this.scope?.ref ?? "Not selected"}</code></p>
      <label for="query">Filename or path</label>
      <input
        part="input"
        id="query"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="results"
        aria-expanded="true"
        aria-activedescendant=${this.selected >= 0 ? `option-${this.selected}` : nothing}
        maxlength="128"
        autocomplete="off"
        autofocus
        .value=${this.query}
        @input=${this.onInput}
        @keydown=${this.onKeydown}
      />
      <div id="results" part="results" role="listbox" aria-label="Files" aria-busy=${this.loading}>
        ${this.paths.map(
          (path, index) => html`<button
            type="button"
            part=${index === this.selected ? "option selected" : "option"}
            id=${`option-${index}`}
            role="option"
            tabindex="-1"
            aria-selected=${index === this.selected}
            @pointerdown=${(event: PointerEvent) => event.preventDefault()}
            @click=${() => this.choose(index)}
            title=${path}
          >
            <strong>${path.slice(path.lastIndexOf("/") + 1)}</strong><span>${path}</span>
          </button>`,
        )}
      </div>
      <div part="status" role="status" aria-live="polite">
        ${this.loading
          ? "Searching…"
          : this.error
            ? nothing
            : !this.client || !validScope(this.scope)
              ? "Choose a repository snapshot to search."
              : !this.paths.length
                ? "No files found."
                : `${this.paths.length} files`}
        ${this.truncated ? html`<p>More matches—refine query.</p>` : nothing}
        ${this.incomplete
          ? html`<p>Listing budget reached; results may be incomplete.</p>`
          : nothing}
      </div>
      ${this.error ? html`<p part="error" role="alert">${this.error}</p>` : nothing}
      <small>↑ ↓ to select · Enter to open · Esc to close</small>
    </dialog>`;
  }

  static override styles = css`
    ${repositoryStyles}
    dialog {
      box-sizing: border-box;
      width: min(40rem, calc(100vw - 2rem));
      max-height: calc(100dvh - 2rem);
      overflow: auto;
      padding: 1rem;
      color: CanvasText;
      background: Canvas;
      border: 1px solid var(--cw-border-color);
      border-radius: 0.75rem;
      box-shadow: 0 1.5rem 5rem rgb(0 0 0 / 0.18);
    }
    dialog:modal {
      overscroll-behavior: contain;
    }
    dialog::backdrop {
      background: rgb(0 0 0 / 0.55);
      overflow: hidden;
      overscroll-behavior: contain;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    h2 {
      margin: 0;
      font-size: 1.25rem;
    }
    p {
      margin: 0.5rem 0;
      overflow-wrap: anywhere;
    }
    label {
      display: block;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      font: inherit;
      min-height: 2.75rem;
      margin: 0.5rem 0;
    }
    button {
      color: inherit;
      background: transparent;
      font: inherit;
      min-height: 2.75rem;
      cursor: pointer;
    }
    #results {
      height: min(20rem, 40dvh);
      overflow: auto;
      border: 1px solid var(--cw-border-color);
      border-radius: 0.5rem;
      padding: 0.25rem;
    }
    [role="option"] {
      display: flex;
      flex-direction: column;
      width: 100%;
      padding: 0.625rem 0.75rem;
      border: 0;
      border-radius: 0.25rem;
      text-align: left;
    }
    [role="option"] span {
      font-size: 0.875rem;
      overflow-wrap: anywhere;
      color: var(--cw-muted-color);
    }
    [aria-selected="true"] {
      background: color-mix(in srgb, CanvasText 7%, Canvas);
      outline: 1px solid var(--cw-border-color);
      outline-offset: -1px;
    }
    :focus-visible {
      outline: 2px solid var(--cw-repository-accent);
      outline-offset: 2px;
    }
    strong {
      font-weight: 550;
    }
    label,
    #context,
    small,
    [part="status"] {
      color: var(--cw-muted-color);
      font-size: 0.8125rem;
    }
    [part="status"] {
      margin-block: 0.5rem;
    }
    code {
      font-size: 0.8125rem;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-file-picker": CwFilePicker;
  }
}
