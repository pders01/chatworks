import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { WorkbenchRegistry } from "../lib/workbench.js";

@customElement("cw-workbench-switcher")
export class CwWorkbenchSwitcher extends LitElement {
  @property({ attribute: false }) registry?: WorkbenchRegistry;
  @property({ type: String }) region = "primary";
  @property({ type: String }) label = "Views";

  override connectedCallback(): void {
    super.connectedCallback();
    this.registry?.addEventListener("cw:workbench-change", this.onRegistryChange);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.registry?.removeEventListener("cw:workbench-change", this.onRegistryChange);
  }

  protected override updated(changed: Map<string, unknown>): void {
    if (!changed.has("registry")) return;
    const previous = changed.get("registry") as WorkbenchRegistry | undefined;
    previous?.removeEventListener("cw:workbench-change", this.onRegistryChange);
    this.registry?.addEventListener("cw:workbench-change", this.onRegistryChange);
  }

  private onRegistryChange = (): void => this.requestUpdate();

  private select(id: string): void {
    this.registry?.openView(id);
    this.dispatchEvent(
      new CustomEvent("cw:view-selected", {
        detail: { id, region: this.region },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const views = this.registry?.views(this.region) ?? [];
    if (views.length === 0) return nothing;
    const active = this.registry?.activeView(this.region) ?? "";
    return html`
      <nav aria-label=${this.label} part="navigation">
        ${views.map(
          (view) => html`
            <button
              type="button"
              class=${active === view.id ? "active" : ""}
              aria-current=${active === view.id ? "page" : nothing}
              title=${view.description || view.title}
              @click=${() => this.select(view.id)}
            >
              ${view.icon
                ? html`<span class="icon" aria-hidden="true">${view.icon}</span>`
                : nothing}
              <span>${view.title}</span>
            </button>
          `,
        )}
      </nav>
    `;
  }

  static override styles = css`
    :host {
      display: inline-flex;
      min-width: 0;
      color: var(--text-muted, inherit);
      font: 0.75rem/1 var(--font-sans, system-ui, sans-serif);
    }
    nav {
      display: flex;
      align-items: center;
      gap: 0.2rem;
      min-width: 0;
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      height: 1.7rem;
      padding: 0 0.5rem;
      overflow: hidden;
      border: 1px solid transparent;
      border-radius: var(--radius-sm, 4px);
      color: inherit;
      background: transparent;
      font: inherit;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }
    button:hover {
      color: var(--text, currentColor);
      background: var(--surface-2, color-mix(in srgb, currentColor 8%, transparent));
    }
    button.active {
      color: var(--text, currentColor);
      border-color: var(--border-default, currentColor);
      background: var(--surface-2, color-mix(in srgb, currentColor 8%, transparent));
    }
    .icon {
      flex: none;
    }
    :focus-visible {
      outline: 2px solid var(--accent-assistant, Highlight);
      outline-offset: 1px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-workbench-switcher": CwWorkbenchSwitcher;
  }
}
