import { css } from "lit";

/**
 * Deliberately modest defaults for Chatworks components in an otherwise bare
 * document. Product applications can override every value through normal host
 * inheritance and exposed parts.
 */
export const browserStyles = css`
  :host {
    color: CanvasText;
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    font-size: 1rem;
    line-height: 1.5;
    --cw-border-color: color-mix(in srgb, CanvasText 24%, Canvas);
    --cw-muted-color: color-mix(in srgb, CanvasText 72%, Canvas);

    text-rendering: optimizeLegibility;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  button {
    min-block-size: 2.25rem;
    min-inline-size: 2.25rem;
  }

  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  textarea,
  select {
    min-block-size: 2.25rem;
  }

  button:not(:disabled),
  select:not(:disabled),
  input:is([type="checkbox"], [type="radio"], [type="range"]):not(:disabled) {
    cursor: pointer;
  }

  button:disabled,
  input:disabled,
  textarea:disabled,
  select:disabled {
    cursor: not-allowed;
  }

  :focus-visible {
    outline: 2px solid AccentColor;
    outline-offset: 2px;
  }

  code,
  kbd,
  pre,
  samp {
    font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }
`;
