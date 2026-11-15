import { LitElement, css, html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { FileTabDragController, reorderFileTabs } from "./file-tab-drag-controller.js";
import {
  fileTabDomId,
  fileTabsStyles,
  renderFileTabs,
  type FileTab,
} from "./file-tabs-template.js";
import { emit } from "./contracts.js";
import { repositoryStyles } from "./styles.js";

export interface FileTabsChange {
  readonly action: "select" | "close" | "reorder";
  readonly id: string;
  readonly tabs: readonly FileTab[];
  readonly activeId: string;
}

/** Local navigation, never an editor buffer manager. The host owns the panel content. */
@customElement("cw-file-tabs")
export class CwFileTabs extends LitElement {
  @property({ attribute: false }) tabs: readonly FileTab[] = [];
  @property({ attribute: "active-id" }) activeId = "";

  private readonly drag = new FileTabDragController(
    this,
    () => this.tabs,
    (id, before) => {
      this.tabs = reorderFileTabs(this.tabs, id, before);
      this.changed("reorder", id);
    },
  );

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.hasAttribute("tabindex")) this.tabIndex = -1;
  }

  protected override willUpdate(_changed: PropertyValues): void {
    if (!this.tabs.some((tab) => tab.id === this.activeId)) this.activeId = this.tabs[0]?.id ?? "";
  }

  private select = (id: string): void => {
    this.activeId = id;
    this.changed("select", id);
  };

  private close = (id: string): void => {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    this.tabs = this.tabs.filter((tab) => tab.id !== id);
    if (id === this.activeId)
      this.activeId = this.tabs[Math.min(index, this.tabs.length - 1)]?.id ?? "";
    this.changed("close", id);
  };

  private changed(action: FileTabsChange["action"], id: string): void {
    emit<FileTabsChange>(this, "cw:file-tabs-change", {
      action,
      id,
      tabs: this.tabs,
      activeId: this.activeId,
    });
  }

  override render() {
    const active = this.tabs.find((tab) => tab.id === this.activeId) ?? this.tabs[0];
    return html`${renderFileTabs(this.tabs, active?.id ?? "", this.select, this.close, this.drag)}
      <div
        id="file-tab-panel"
        part="panel"
        role="tabpanel"
        aria-label=${active?.description ?? "File preview"}
        aria-labelledby=${active ? fileTabDomId(active.id) : ""}
      >
        <slot></slot>
      </div>`;
  }

  static override styles = [
    repositoryStyles,
    fileTabsStyles,
    css`
      :host {
        display: block;
        min-width: 0;
        --border-default: var(--cw-border-color);
        --surface-1: Canvas;
        --surface-2: color-mix(in srgb, CanvasText 5%, Canvas);
        --surface-3: color-mix(in srgb, CanvasText 7%, Canvas);
        --accent-action: var(--cw-repository-accent);
        --text-muted: var(--cw-muted-color);
        --text: CanvasText;
        --text-xs: 0.8125rem;
      }
      [part="panel"] {
        min-width: 0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-file-tabs": CwFileTabs;
  }
}
