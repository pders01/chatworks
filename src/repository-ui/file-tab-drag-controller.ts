import type { LitElement, ReactiveController } from "lit";
import { fileTabDomId, revealFileTab, type FileTab } from "./file-tabs-template.js";

export function reorderFileTabs<T extends FileTab>(
  tabs: readonly T[],
  id: string,
  beforeId: string | null,
): readonly T[] {
  const item = tabs.find((tab) => tab.id === id);
  if (!item || id === beforeId || (beforeId !== null && !tabs.some((tab) => tab.id === beforeId)))
    return tabs;
  const rest = tabs.filter((tab) => tab.id !== id);
  const index = beforeId === null ? rest.length : rest.findIndex((tab) => tab.id === beforeId);
  return [...rest.slice(0, index), item, ...rest.slice(index)];
}

interface Drag {
  id: string;
  pointerId: number;
  target: HTMLElement;
  strip: HTMLElement;
  ids: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  before: string | null | undefined;
}

/** Pointer reordering with a separate touch grip, leaving label swipes scrollable. */
export class FileTabDragController implements ReactiveController {
  private drag?: Drag;
  private frame = 0;
  private suppressClickUntil = 0;
  announcement = "";

  constructor(
    private readonly host: LitElement,
    private readonly tabs: () => readonly FileTab[],
    private readonly reorder: (id: string, beforeId: string | null) => void,
  ) {
    host.addController(this);
  }

  hostDisconnected(): void {
    this.cancel();
  }
  hostUpdate(): void {
    // List changes are known before rendering, so cancellation participates in
    // that update rather than scheduling a redundant post-render update.
    if (this.drag && this.ids() !== this.drag.ids) this.cancel(false);
  }
  hostUpdated(): void {
    if (this.drag && (!this.drag.target.getClientRects().length || this.ids() !== this.drag.ids))
      this.cancel();
  }

  isDragging(id: string): boolean {
    return Boolean(this.drag?.moved && this.drag.id === id);
  }
  isBefore(id: string): boolean {
    return Boolean(this.drag?.moved && this.drag.before === id);
  }
  get atEnd(): boolean {
    return Boolean(this.drag?.moved && this.drag.before === null);
  }

  consumeClick(): boolean {
    const suppress = performance.now() < this.suppressClickUntil;
    this.suppressClickUntil = 0;
    return suppress;
  }

  pointerDown(event: PointerEvent, id: string, grip = false): void {
    // Horizontal swipes on touch labels belong to the native overflow strip.
    // The dedicated grip is the only touch-action:none surface.
    if (event.button !== 0 || !event.isPrimary || (event.pointerType !== "mouse" && !grip)) return;
    this.cancel();
    const target = event.currentTarget as HTMLElement;
    const strip = target.closest<HTMLElement>(".file-tabs");
    if (!strip) return;
    this.drag = {
      id,
      pointerId: event.pointerId,
      target,
      strip,
      ids: this.ids(),
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      before: undefined,
    };
    target.setPointerCapture(event.pointerId);
    document.addEventListener("pointermove", this.onMove, true);
    document.addEventListener("pointerup", this.onUp, true);
    document.addEventListener("pointercancel", this.onCancel, true);
    document.addEventListener("lostpointercapture", this.onCancel, true);
    if (grip) event.preventDefault();
  }

  cancelDrag(): boolean {
    if (!this.drag) return false;
    this.suppressClickUntil = performance.now() + 300;
    this.cancel();
    return true;
  }

  moveBy(id: string, delta: -1 | 1): void {
    const tabs = this.tabs();
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0 || index + delta < 0 || index + delta >= tabs.length) return;
    this.cancel();
    this.commit(id, delta === -1 ? tabs[index - 1]!.id : (tabs[index + 2]?.id ?? null), true);
  }

  private ids(): string {
    return JSON.stringify(this.tabs().map((tab) => tab.id));
  }

  private onMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6) return;
    drag.moved = true;
    event.preventDefault();
    this.updateTarget();
    if (!this.frame) this.frame = requestAnimationFrame(this.autoScroll);
  };

  private updateTarget(): void {
    const drag = this.drag;
    if (!drag) return;
    const bounds = drag.strip.getBoundingClientRect();
    let before: string | null | undefined;
    if (
      drag.y >= bounds.top - 24 &&
      drag.y <= bounds.bottom + 24 &&
      drag.x >= bounds.left - 24 &&
      drag.x <= bounds.right + 24
    ) {
      before = null;
      for (const tab of drag.strip.querySelectorAll<HTMLElement>(".file-tab")) {
        if (tab.dataset.fileTabId === drag.id) continue;
        const rect = tab.getBoundingClientRect();
        if (drag.x < rect.left + rect.width / 2) {
          before = tab.dataset.fileTabId;
          break;
        }
      }
    }
    drag.before = before;
    this.host.requestUpdate();
  }

  private autoScroll = (): void => {
    this.frame = 0;
    const drag = this.drag;
    if (!drag?.moved) return;
    if (!drag.target.getClientRects().length || !this.host.isConnected || this.ids() !== drag.ids) {
      this.cancel();
      return;
    }
    const bounds = drag.strip.getBoundingClientRect();
    if (drag.y >= bounds.top - 24 && drag.y <= bounds.bottom + 24) {
      const speed = drag.x < bounds.left + 36 ? -10 : drag.x > bounds.right - 36 ? 10 : 0;
      if (speed) {
        const previous = drag.strip.scrollLeft;
        drag.strip.scrollLeft += speed;
        if (previous !== drag.strip.scrollLeft) this.updateTarget();
      }
    }
    this.frame = requestAnimationFrame(this.autoScroll);
  };

  private onUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const valid = this.ids() === drag.ids && drag.target.getClientRects().length > 0;
    this.cancel();
    if (drag.moved) {
      this.suppressClickUntil = performance.now() + 300;
      event.preventDefault();
      if (valid && drag.before !== undefined) this.commit(drag.id, drag.before);
    }
  };

  private onCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.drag?.pointerId) this.cancel();
  };

  private commit(id: string, before: string | null, focus = false): void {
    const tab = this.tabs().find((tab) => tab.id === id);
    this.reorder(id, before);
    const index = this.tabs().findIndex((item) => item.id === id);
    this.announcement = `${tab?.label ?? "File"} moved to position ${index + 1} of ${this.tabs().length}.`;
    this.host.requestUpdate();
    void this.host.updateComplete.then(() => {
      if (this.host.isConnected && this.tabs().some((tab) => tab.id === id)) {
        revealFileTab(this.host.renderRoot, id);
        if (focus)
          this.host.renderRoot
            .querySelector<HTMLElement>(`[id="${fileTabDomId(id)}"]`)
            ?.focus({ preventScroll: true });
      }
    });
  }

  private cancel(update = true): void {
    const drag = this.drag;
    this.drag = undefined;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    document.removeEventListener("pointermove", this.onMove, true);
    document.removeEventListener("pointerup", this.onUp, true);
    document.removeEventListener("pointercancel", this.onCancel, true);
    document.removeEventListener("lostpointercapture", this.onCancel, true);
    if (drag?.target.hasPointerCapture(drag.pointerId))
      drag.target.releasePointerCapture(drag.pointerId);
    if (drag && update) this.host.requestUpdate();
  }
}
