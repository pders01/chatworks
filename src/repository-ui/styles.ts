import { css } from "lit";
import { browserStyles } from "../styles.js";

/** Shared Chatworks foundation, with quiet defaults for source-reading controls. */
export const repositoryStyles = css`
  ${browserStyles}
  :host {
    font-size: 0.875rem;
    --cw-border-color: color-mix(in srgb, CanvasText 16%, Canvas);
    --cw-muted-color: color-mix(in srgb, CanvasText 68%, Canvas);
    --cw-repository-accent: CanvasText;
  }
  button,
  input {
    border: 1px solid var(--cw-border-color);
    border-radius: 0.375rem;
    padding: 0.375rem 0.75rem;
    color: inherit;
    background: transparent;
  }
  button:not(:disabled):hover {
    background: color-mix(in srgb, CanvasText 5%, Canvas);
  }
  button:disabled {
    opacity: 0.55;
  }
  :focus-visible {
    outline: 2px solid var(--cw-repository-accent);
    outline-offset: 2px;
  }
`;
