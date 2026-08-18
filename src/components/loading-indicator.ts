import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { browserStyles } from "../styles.js";

/**
 * Structurally sized loading marker. Applications own its shape and motion
 * through the `indicator`, `sm`, and `lg` parts.
 */
@customElement("cw-spinner")
export class GcSpinner extends LitElement {
  @property({ type: String }) size: "sm" | "lg" = "sm";

  static styles = css`
    ${browserStyles}
    :host {
      display: inline-block;
    }
    .dot {
      display: inline-block;
      border: 2px solid var(--cw-border-color);
      border-block-start-color: AccentColor;
      border-radius: 50%;
      animation: cw-spin 0.8s linear infinite;
    }
    .dot.sm {
      width: 10px;
      height: 10px;
    }
    .dot.lg {
      width: 20px;
      height: 20px;
    }
    @keyframes cw-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .dot {
        animation: none;
      }
    }
  `;

  override render() {
    return html`<span
      class="dot ${this.size}"
      part="indicator ${this.size}"
      aria-hidden="true"
    ></span>`;
  }
}

/**
 * Full-area loading card: a large spinner beside a heading and an
 * optional detail line. Drop it in place of a content area while an
 * expensive RPC resolves.
 *
 * The `heading` prop is the primary "what's happening" line (e.g.
 * "computing blame…"). `detail` is an optional secondary line for
 * context ("this can take a while on large files"). Use the default
 * slot to pass richer content instead of the two props.
 */
@customElement("cw-loading-banner")
export class GcLoadingBanner extends LitElement {
  @property({ type: String }) heading = "loading…";
  @property({ type: String }) detail = "";

  static styles = css`
    ${browserStyles}
    :host {
      display: block;
    }
    .wrap {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-4, 1rem);
    }
    .txt {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .detail {
      max-width: 60ch;
    }
  `;

  override render() {
    return html`
      <div class="wrap" part="wrap" role="status" aria-live="polite">
        <cw-spinner size="lg" part="spinner" exportparts="indicator, lg"></cw-spinner>
        <div class="txt" part="txt">
          <div class="heading" part="heading">${this.heading}</div>
          ${this.detail ? html`<div class="detail" part="detail">${this.detail}</div>` : nothing}
          <slot></slot>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-spinner": GcSpinner;
    "cw-loading-banner": GcLoadingBanner;
  }
}
