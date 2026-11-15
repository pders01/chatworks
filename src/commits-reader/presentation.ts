import { css } from "lit";

/** Package-owned foundation. Hosts supply theme roles without importing host CSS. */
export const componentPresentation = css`
  :host {
    color: var(--text);
    font-family: var(--font-sans);
  }

  button,
  input,
  select,
  textarea,
  summary {
    font: inherit;
  }

  :focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }
`;
