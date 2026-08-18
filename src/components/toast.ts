import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { browserStyles } from "../styles.js";

type ToastKind = "info" | "success" | "warn" | "error";

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

const KIND_ICONS: Record<ToastKind, string> = {
  info: "i",
  success: "✓",
  warn: "!",
  error: "×",
};

// Auto-dismiss timing. Errors and warnings linger longer because they
// carry more consequential information.
const DISMISS_MS: Record<ToastKind, number> = {
  info: 4000,
  success: 3500,
  warn: 6000,
  error: 7000,
};

let nextId = 0;

// cw-toast is a singleton mounted at the app level. Any component can
// dispatch a gc:toast CustomEvent (bubbles + composed) and the toast
// will appear. Auto-dismisses after 4s; click to dismiss early.
//
// Usage from any child component:
//   this.dispatchEvent(new CustomEvent("gc:toast", {
//     bubbles: true, composed: true,
//     detail: { message: "Copied!", kind: "success" },
//   }));

@customElement("cw-toast")
export class GcToast extends LitElement {
  @state() private items: ToastItem[] = [];

  override connectedCallback() {
    super.connectedCallback();
    // Listen at the host level — composed events cross shadow DOM.
    this.getRootNode().addEventListener("gc:toast", this.onToast as EventListener);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.getRootNode().removeEventListener("gc:toast", this.onToast as EventListener);
  }

  private onToast = (e: CustomEvent<{ message: string; kind?: string }>) => {
    const id = nextId++;
    const kind = normalizeKind(e.detail.kind);
    const item: ToastItem = { id, message: e.detail.message, kind };
    this.items = [...this.items, item];
    setTimeout(() => this.dismiss(id), DISMISS_MS[kind]);
  };

  private dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }

  override render() {
    return html`
      <div class="stack" part="stack" role="status" aria-live="polite">
        ${repeat(
          this.items,
          (t) => t.id,
          (t) => html`
            <div class="toast ${t.kind}" part="toast ${t.kind}" role="alert">
              <span class="icon" part="icon" aria-hidden="true">${KIND_ICONS[t.kind]}</span>
              <span class="message" part="message">${t.message}</span>
              <button
                class="close"
                part="close"
                aria-label="Dismiss notification"
                @click=${() => this.dismiss(t.id)}
              >
                ×
              </button>
            </div>
          `,
        )}
      </div>
    `;
  }

  static override styles = css`
    ${browserStyles}
    /* Centered bottom-anchored stack — more discoverable than a
       corner, not as intrusive as screen-center. Constrained width so
       long messages don't stretch edge-to-edge. */
      :host {
      position: fixed;
      bottom: var(--space-6, 1.5rem);
      left: 50%;
      transform: translateX(-50%);
      z-index: 200;
      pointer-events: none;
      width: min(480px, calc(100vw - 2 * var(--space-5, 1.25rem)));
    }
    .stack {
      display: flex;
      flex-direction: column-reverse;
      gap: var(--space-2, 0.5rem);
    }
    .toast {
      pointer-events: auto;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      border: 1px solid var(--cw-border-color);
      border-radius: 0.5rem;
      background: Canvas;
      box-shadow: 0 0.75rem 2rem color-mix(in srgb, CanvasText 18%, transparent);
    }
    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      flex-shrink: 0;
    }
    .message {
      min-width: 0;
      word-wrap: break-word;
    }
    .close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      cursor: pointer;
      flex-shrink: 0;
    }
    .close:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 1px;
    }
  `;
}

function normalizeKind(raw: unknown): ToastKind {
  if (raw === "success" || raw === "warn" || raw === "error" || raw === "info") return raw;
  return "info";
}

// Helper for dispatching toast from anywhere.
export function toast(el: HTMLElement, message: string, kind: ToastKind = "info") {
  el.dispatchEvent(
    new CustomEvent("gc:toast", {
      bubbles: true,
      composed: true,
      detail: { message, kind },
    }),
  );
}
