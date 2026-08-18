import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { asDisposable, type Disposable, type WorkbenchRegistry } from "../lib/workbench.js";
import { browserStyles } from "../styles.js";

@customElement("cw-workbench-view")
export class CwWorkbenchView extends LitElement {
  @property({ attribute: false }) registry?: WorkbenchRegistry;
  @property({ type: String, attribute: "view-id" }) viewId = "";
  @property({ type: String }) empty = "Select a view";

  @state() private phase: "empty" | "mounting" | "ready" | "error" = "empty";
  @state() private error = "";

  private mountedId = "";
  private mountedRegistry?: WorkbenchRegistry;
  private mountedDisposable?: Disposable;
  private generation = 0;
  private mountScheduled = false;

  override connectedCallback(): void {
    super.connectedCallback();
    this.registry?.addEventListener("cw:workbench-change", this.onRegistryChange);
    this.scheduleMount();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.registry?.removeEventListener("cw:workbench-change", this.onRegistryChange);
    this.unmount();
  }

  protected override updated(changed: Map<string, unknown>): void {
    if (changed.has("registry")) {
      const previous = changed.get("registry") as WorkbenchRegistry | undefined;
      previous?.removeEventListener("cw:workbench-change", this.onRegistryChange);
      this.registry?.addEventListener("cw:workbench-change", this.onRegistryChange);
    }
    if (changed.has("registry") || changed.has("viewId")) this.scheduleMount();
  }

  private scheduleMount(): void {
    if (this.mountScheduled) return;
    this.mountScheduled = true;
    queueMicrotask(() => {
      this.mountScheduled = false;
      if (this.isConnected) void this.mountView();
    });
  }

  private onRegistryChange = (event: Event): void => {
    if (!this.viewId) return;
    const detail = (event as CustomEvent<{ kind?: string; id?: string }>).detail;
    const registrationChanged = detail.kind === "views" && detail.id === this.viewId;
    const becameUnavailable = detail.kind === "context" && !this.registry?.view(this.viewId);
    if (!registrationChanged && !becameUnavailable) return;
    this.mountedId = "";
    this.scheduleMount();
  };

  private async mountView(): Promise<void> {
    const registry = this.registry;
    const id = this.viewId;
    if (registry === this.mountedRegistry && id === this.mountedId) return;
    this.unmount();

    const container = this.renderRoot.querySelector<HTMLElement>(".mount");
    if (!container || !registry || !id) {
      this.phase = "empty";
      return;
    }
    const view = registry.view(id);
    if (!view) {
      this.phase = "error";
      this.error = `View is not available: ${id}`;
      return;
    }

    const generation = ++this.generation;
    this.phase = "mounting";
    this.error = "";
    this.mountedId = id;
    this.mountedRegistry = registry;
    const surface = document.createElement("div");
    surface.className = "surface";
    surface.setAttribute("part", "surface");
    container.replaceChildren(surface);
    try {
      const result = await view.mount(surface, registry.viewContext(id));
      const disposable = asDisposable(result);
      if (generation !== this.generation || !this.isConnected) {
        disposable?.dispose();
        return;
      }
      this.mountedDisposable = disposable;
      this.phase = "ready";
    } catch (error) {
      if (generation !== this.generation) return;
      container.replaceChildren();
      this.mountedId = "";
      this.phase = "error";
      this.error = error instanceof Error ? error.message : String(error);
      this.dispatchEvent(
        new CustomEvent("cw:view-error", {
          detail: { viewId: id, error },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private unmount(): void {
    this.generation += 1;
    this.mountedDisposable?.dispose();
    this.mountedDisposable = undefined;
    this.mountedId = "";
    this.mountedRegistry = undefined;
    this.renderRoot.querySelector<HTMLElement>(".mount")?.replaceChildren();
  }

  override render() {
    return html`
      <div class="mount" part="mount"></div>
      ${this.phase === "empty"
        ? html`<div class="state empty" part="empty">${this.empty}</div>`
        : this.phase === "mounting"
          ? html`<div class="state loading" part="loading" role="status">Loading view…</div>`
          : this.phase === "error"
            ? html`<div class="state error" part="error" role="alert">${this.error}</div>`
            : nothing}
    `;
  }

  static override styles = css`
    ${browserStyles}
    :host {
      position: relative;
      display: block;
      min-width: 0;
      min-height: 0;
    }
    .mount,
    .surface {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
    }
    .state {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 1rem;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-workbench-view": CwWorkbenchView;
  }
}
