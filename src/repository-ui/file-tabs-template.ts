import { css, html, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { FileTabDragController } from "./file-tab-drag-controller.js";

/** Review navigation only; editor buffers, drafts and source positions remain host-owned. */
export interface FileTab {
  id: string;
  label: string;
  description: string;
}

export function fileTabDomId(id: string): string {
  return `file-tab-${encodeURIComponent(id)}`;
}

export function revealFileTab(root: ParentNode, id: string): void {
  // Reveal the close control as well as the label, especially on touch screens.
  root
    .querySelector<HTMLElement>(`[id="${fileTabDomId(id)}"]`)
    ?.closest(".file-tab")
    ?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Render in a shadow root alongside #file-tab-panel. IDs are local to that root. */
export function renderFileTabs(
  tabs: readonly FileTab[],
  activeId: string,
  select: (id: string) => void,
  close: (id: string) => void,
  drag?: FileTabDragController,
): TemplateResult | typeof nothing {
  if (tabs.length === 0) return nothing;
  const focusTab = (root: ParentNode, id: string) => {
    const tab = root.querySelector<HTMLButtonElement>(`[id="${fileTabDomId(id)}"]`);
    tab?.focus({ preventScroll: true });
    revealFileTab(root, id);
  };
  const closeTab = (event: Event, id: string) => {
    const button = event.currentTarget as HTMLButtonElement;
    const root = button.getRootNode() as ShadowRoot;
    close(id);
    // The owning Lit view renders first; focus follows the surviving tab, never
    // the document body. Closing the last tab returns focus to the host.
    requestAnimationFrame(() => {
      // A host handler may already have moved focus outside this shadow root.
      let focused = root.ownerDocument.activeElement;
      while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
      if (
        !root.host.isConnected ||
        (focused &&
          focused !== button &&
          focused !== root.host &&
          focused !== root.ownerDocument.body)
      )
        return;
      const selected = root.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
      if (selected) {
        selected.focus({ preventScroll: true });
        selected.closest(".file-tab")?.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else (root.host as HTMLElement).focus({ preventScroll: true });
    });
  };
  const onKeydown = (event: KeyboardEvent, id: string) => {
    if (event.isComposing) return;
    if (
      drag &&
      event.altKey &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault();
      event.stopPropagation();
      drag.moveBy(id, event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    let next: FileTab | undefined;
    switch (event.key) {
      case "ArrowRight":
        next = tabs[(index + 1) % tabs.length];
        break;
      case "ArrowLeft":
        next = tabs[(index + tabs.length - 1) % tabs.length];
        break;
      case "Home":
        next = tabs[0];
        break;
      case "End":
        next = tabs.at(-1);
        break;
      case "Delete":
        event.preventDefault();
        event.stopPropagation();
        closeTab(event, id);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (next) {
      select(next.id);
      focusTab((event.currentTarget as HTMLButtonElement).getRootNode() as ShadowRoot, next.id);
    }
  };
  return html`<div
      class="file-tabs"
      part="tablist"
      role="tablist"
      aria-label="Open files"
      data-drop-end=${drag?.atEnd ?? false}
      @keydown=${(event: KeyboardEvent) => {
        if (event.key === "Escape" && drag?.cancelDrag()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      ${repeat(
        tabs,
        (tab) => tab.id,
        (tab) => html`<div
          class="file-tab"
          part=${tab.id === activeId ? "tab active" : "tab"}
          role="presentation"
          data-active=${tab.id === activeId}
          data-file-tab-id=${tab.id}
          data-dragging=${drag?.isDragging(tab.id) ?? false}
          data-drop-before=${drag?.isBefore(tab.id) ?? false}
        >
          ${drag
            ? html`<button
                class="file-tab-grip"
                part="grip"
                type="button"
                aria-label=${`Move ${tab.description}`}
                title="Drag to reorder; Alt+Shift+←/→ on a tab"
                tabindex="-1"
                @pointerdown=${(event: PointerEvent) => drag.pointerDown(event, tab.id, true)}
                @click=${() => drag.consumeClick()}
              >
                <span aria-hidden="true">⠿</span>
              </button>`
            : nothing}
          <button
            class="file-tab-select"
            part="select"
            type="button"
            role="tab"
            id=${fileTabDomId(tab.id)}
            aria-controls="file-tab-panel"
            aria-selected=${tab.id === activeId}
            aria-label=${tab.description}
            title=${tab.description}
            tabindex=${tab.id === activeId ? 0 : -1}
            @pointerdown=${(event: PointerEvent) => drag?.pointerDown(event, tab.id)}
            @click=${() => {
              if (!drag?.consumeClick()) select(tab.id);
            }}
            @keydown=${(event: KeyboardEvent) => onKeydown(event, tab.id)}
          >
            <span>${tab.label}</span>
          </button>
          <button
            class="file-tab-close"
            part="close"
            type="button"
            aria-label=${`Close ${tab.description}`}
            title="Close tab (Delete)"
            tabindex=${tab.id === activeId ? 0 : -1}
            @click=${(event: Event) => closeTab(event, tab.id)}
          >
            ×
          </button>
        </div>`,
      )}
    </div>
    <span class="file-tabs-status" aria-live="polite" aria-atomic="true"
      >${drag?.announcement ?? ""}</span
    >`;
}

export const fileTabsStyles = css`
  .file-tabs {
    display: flex;
    flex: 0 0 auto;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-1);
    scrollbar-width: thin;
  }
  .file-tab {
    display: flex;
    flex: 0 0 auto;
    min-width: 0;
    max-width: 22rem;
    border-right: 1px solid var(--border-default);
    border-bottom: 2px solid transparent;
  }
  .file-tab[data-active="true"] {
    background: var(--surface-2);
    border-bottom-color: var(--accent-action);
  }
  .file-tabs button {
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font: inherit;
    font-size: var(--text-xs);
    min-height: 2.5rem;
  }
  .file-tab-grip {
    flex: 0 0 1.5rem;
    padding: 0;
    touch-action: none;
    cursor: grab !important;
  }
  .file-tab-grip span {
    pointer-events: none;
  }
  .file-tab[data-dragging="true"] {
    opacity: 0.5;
  }
  .file-tab[data-drop-before="true"] {
    box-shadow: inset 3px 0 var(--accent-action);
  }
  .file-tabs[data-drop-end="true"] .file-tab:last-child {
    box-shadow: inset -3px 0 var(--accent-action);
  }
  .file-tabs-status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .file-tab-select {
    user-select: none;
    touch-action: pan-x;
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 0.4rem 0.65rem;
    text-align: left;
  }
  .file-tab-select span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-tab-close {
    flex: 0 0 2.25rem;
    padding: 0.3rem;
  }
  .file-tab[data-active="true"] button {
    color: var(--text);
  }
  .file-tabs button:hover {
    background: var(--surface-3);
  }
  .file-tabs button:focus-visible {
    outline: 2px solid var(--accent-action);
    outline-offset: -3px;
  }
  @media (max-width: 800px) {
    .file-tab {
      max-width: 17rem;
    }
    .file-tabs button {
      min-height: 2.75rem;
    }
    .file-tab-close {
      flex-basis: 2.75rem;
    }
  }
`;
