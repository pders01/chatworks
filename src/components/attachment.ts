import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { fmtBytes, type AttachmentInfo } from "../lib/chat-types.js";
import type { RemoveAttachmentDetail } from "../lib/events.js";
import { browserStyles } from "../styles.js";

export type { RemoveAttachmentDetail } from "../lib/events.js";

/**
 * A transport-free file or image attachment.
 *
 * The component owns only attachment presentation and its optional remove
 * action. Lists, upload state, and attachment storage remain caller-owned.
 */
@customElement("cw-attachment")
export class CwAttachment extends LitElement {
  @property({ attribute: false }) attachment?: AttachmentInfo;
  @property({ type: Boolean, reflect: true }) removable = false;
  @property({ type: Boolean, attribute: "list-item" }) listItem = false;

  private requestRemove(): void {
    if (!this.attachment) return;
    this.dispatchEvent(
      new CustomEvent<RemoveAttachmentDetail>("gc:remove-attachment", {
        detail: { attachment: this.attachment },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const attachment = this.attachment;
    if (!attachment) return nothing;

    const image = attachment.mimeType.startsWith("image/") && attachment.url;
    const kind = image ? "is-image" : "is-file";
    const parts = `attachment-chip ${kind}${this.removable ? " removable" : ""}`;
    const tooltip = `${attachment.filename} · ${fmtBytes(attachment.size)}`;
    const remove = this.removable
      ? html`<button
          type="button"
          class="attachment-remove"
          part="attachment-remove"
          aria-label=${`Remove ${attachment.filename}`}
          title="Remove attachment"
          @click=${this.requestRemove}
        >
          ×
        </button>`
      : nothing;

    return html`<div
      class=${`attachment-chip ${kind}`}
      part=${parts}
      role=${this.listItem ? "listitem" : nothing}
      title=${tooltip}
    >
      ${image
        ? html`<img
            src=${attachment.url!}
            alt=${attachment.filename}
            class="attachment-thumb"
            part="attachment-thumb"
          />`
        : html`<span class="attachment-glyph" part="attachment-glyph" aria-hidden="true">📄</span>
            <span class="attachment-meta" part="attachment-meta">
              <span class="attachment-name" part="attachment-name">${attachment.filename}</span>
              <span class="attachment-size" part="attachment-size"
                >${fmtBytes(attachment.size)}</span
              >
            </span>`}
      ${remove}
    </div>`;
  }

  static override styles = css`
    ${browserStyles}
    :host {
      display: inline-block;
      min-width: 0;
      max-width: 100%;
    }
    .attachment-chip {
      position: relative;
      display: inline-flex;
      max-width: 100%;
      align-items: center;
      border: 1px solid var(--cw-border-color);
      border-radius: 0.5rem;
      background: ButtonFace;
    }
    .attachment-chip.is-image {
      width: 3.5rem;
      height: 3.5rem;
      padding: 0;
      overflow: hidden;
    }
    .attachment-chip.is-file {
      gap: var(--space-2, 0.5rem);
      max-width: 15rem;
      padding: 0.375rem 0.5rem 0.375rem 0.625rem;
    }
    .attachment-thumb {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .attachment-meta {
      display: flex;
      min-width: 0;
      flex-direction: column;
    }
    .attachment-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .attachment-size {
      font-size: 0.8125rem;
    }
    .attachment-remove {
      display: inline-flex;
      width: 2rem;
      height: 2rem;
      min-width: 2rem;
      min-height: 2rem;
      align-items: center;
      justify-content: center;
      padding: 0;
      border-color: transparent;
      color: inherit;
      background: transparent;
    }
    .attachment-remove:hover {
      background: color-mix(in srgb, CanvasText 10%, transparent);
    }
    .is-image .attachment-remove {
      position: absolute;
      top: 0.125rem;
      right: 0.125rem;
      background: Canvas;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-attachment": CwAttachment;
  }
}
