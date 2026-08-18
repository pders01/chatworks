import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { WorkbenchCommand, WorkbenchRegistry } from "../lib/workbench.js";
import { browserStyles } from "../styles.js";

@customElement("cw-command-palette")
export class CwCommandPalette extends LitElement {
  @property({ attribute: false }) registry?: WorkbenchRegistry;
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: String }) placeholder = "Type a command";

  @state() private query = "";
  @state() private activeIndex = 0;
  @state() private running = "";
  @state() private error = "";

  override connectedCallback(): void {
    super.connectedCallback();
    this.registry?.addEventListener("cw:workbench-change", this.onRegistryChange);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.registry?.removeEventListener("cw:workbench-change", this.onRegistryChange);
  }

  protected override updated(changed: Map<string, unknown>): void {
    if (changed.has("registry")) {
      const previous = changed.get("registry") as WorkbenchRegistry | undefined;
      previous?.removeEventListener("cw:workbench-change", this.onRegistryChange);
      this.registry?.addEventListener("cw:workbench-change", this.onRegistryChange);
    }
    if (changed.get("open") === false && this.open) {
      this.query = "";
      this.activeIndex = 0;
      this.error = "";
      requestAnimationFrame(() =>
        this.renderRoot.querySelector<HTMLInputElement>("input")?.focus(),
      );
    }
  }

  private onRegistryChange = (): void => this.requestUpdate();

  private get commands(): WorkbenchCommand[] {
    const query = this.query.trim().toLocaleLowerCase();
    const commands = this.registry?.commands() ?? [];
    if (!query) return commands;
    return commands.filter((command) =>
      [command.title, command.category, command.description, command.id]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(query)),
    );
  }

  show(): void {
    this.open = true;
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new CustomEvent("cw:palette-closed", { bubbles: true, composed: true }));
  }

  private input(event: Event): void {
    this.query = (event.target as HTMLInputElement).value;
    this.activeIndex = 0;
    this.error = "";
  }

  private keydown(event: KeyboardEvent): void {
    const commands = this.commands;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      this.activeIndex = Math.min(this.activeIndex + 1, commands.length - 1);
      this.scrollActive();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.activeIndex = Math.max(this.activeIndex - 1, 0);
      this.scrollActive();
    } else if (event.key === "Enter" && commands[this.activeIndex]) {
      event.preventDefault();
      void this.execute(commands[this.activeIndex]);
    }
  }

  private scrollActive(): void {
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({
        block: "nearest",
      }),
    );
  }

  private async execute(command: WorkbenchCommand): Promise<void> {
    if (!this.registry || this.running) return;
    this.running = command.id;
    this.error = "";
    try {
      await this.registry.executeCommand(command.id);
      this.dispatchEvent(
        new CustomEvent("cw:command-executed", {
          detail: { id: command.id },
          bubbles: true,
          composed: true,
        }),
      );
      this.close();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.dispatchEvent(
        new CustomEvent("cw:command-error", {
          detail: { id: command.id, error },
          bubbles: true,
          composed: true,
        }),
      );
    } finally {
      this.running = "";
    }
  }

  override render() {
    if (!this.open) return nothing;
    const commands = this.commands;
    const listId = "cw-command-palette-list";
    const active = commands[this.activeIndex];
    return html`
      <div class="backdrop" part="backdrop" @click=${this.close}></div>
      <section
        class="palette"
        part="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        @keydown=${this.keydown}
      >
        <input
          part="input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          .value=${this.query}
          placeholder=${this.placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-controls=${listId}
          aria-expanded="true"
          aria-activedescendant=${active ? `cw-command-${this.activeIndex}` : nothing}
          @input=${this.input}
        />
        <div id=${listId} class="commands" part="commands" role="listbox">
          ${commands.length
            ? commands.map(
                (command, index) => html`
                  <button
                    id=${`cw-command-${index}`}
                    type="button"
                    role="option"
                    aria-selected=${index === this.activeIndex ? "true" : "false"}
                    class=${index === this.activeIndex ? "active" : ""}
                    part="command ${index === this.activeIndex ? "active" : ""}"
                    ?disabled=${Boolean(this.running)}
                    @pointerenter=${() => (this.activeIndex = index)}
                    @click=${() => void this.execute(command)}
                  >
                    <span class="copy" part="copy">
                      <strong>${command.title}</strong>
                      ${command.description ? html`<small>${command.description}</small>` : nothing}
                    </span>
                    ${command.category
                      ? html`<span class="category" part="category">${command.category}</span>`
                      : nothing}
                  </button>
                `,
              )
            : html`<p class="empty" part="empty">No matching commands</p>`}
        </div>
        ${this.error ? html`<p class="error" part="error" role="alert">${this.error}</p>` : nothing}
      </section>
    `;
  }

  static override styles = css`
    ${browserStyles}
    :host {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: block;
    }
    :host(:not([open])) {
      display: none;
    }
    .backdrop {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, CanvasText 36%, transparent);
    }
    .palette {
      position: relative;
      width: min(620px, calc(100% - 2rem));
      max-height: min(70vh, 520px);
      margin: max(8vh, 2rem) auto 0;
      overflow: hidden;
      border: 1px solid var(--cw-border-color);
      border-radius: 0.75rem;
      background: Canvas;
      box-shadow: 0 1rem 3rem color-mix(in srgb, CanvasText 24%, transparent);
    }
    input {
      box-sizing: border-box;
      width: 100%;
      height: 3rem;
      padding: 0 1rem;
      border: 0;
      border-block-end: 1px solid var(--cw-border-color);
      border-radius: 0;
      color: inherit;
      background: transparent;
    }
    .commands {
      max-height: min(55vh, 420px);
      overflow: auto;
      padding: 0.35rem;
    }
    button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      box-sizing: border-box;
      width: 100%;
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border: 1px solid transparent;
      border-radius: 0.375rem;
      color: inherit;
      background: transparent;
      text-align: left;
      cursor: pointer;
    }
    button.active {
      color: HighlightText;
      background: Highlight;
    }
    .copy {
      display: grid;
      min-width: 0;
      gap: 0.2rem;
    }
    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .category {
      flex: none;
      color: var(--cw-muted-color);
      font-size: 0.8125rem;
    }
    button.active .category {
      color: inherit;
    }
    .empty,
    .error {
      margin: 0;
      padding: 1rem;
    }
    .empty {
      color: var(--cw-muted-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-command-palette": CwCommandPalette;
  }
}
