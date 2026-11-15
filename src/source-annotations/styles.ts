import { css } from "lit";

/** Self-contained presentation. Only --sa-* variables are part of the public API. */
export const panelStyles = css`
  :host {
    --_sa-bg: var(--sa-background, light-dark(#ffffff, #141414));
    --_sa-surface: var(--sa-surface, light-dark(#fafafa, #191919));
    --_sa-muted: var(--sa-muted-surface, light-dark(#f5f5f5, #202020));
    --_sa-border: var(--sa-border, light-dark(#e8e8e8, #303030));
    --_sa-text: var(--sa-text, light-dark(#202020, #ededed));
    --_sa-secondary: var(--sa-secondary, light-dark(#686868, #a4a4a4));
    --_sa-accent: var(--sa-accent, light-dark(#245edb, #91b5ff));
    --_sa-on-accent: var(--sa-on-accent, light-dark(#ffffff, #101d38));
    --_sa-danger: var(--sa-danger, light-dark(#b62b32, #ff9a9f));
    --_sa-warning: var(--sa-warning, light-dark(#856019, #e1bd77));
    --_sa-mono: var(--sa-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    display: block;
    container: source-annotations / inline-size;
    min-inline-size: 0;
    min-block-size: 0;
    color: var(--_sa-text);
    background: var(--_sa-bg);
    font: 400 0.875rem/1.6 var(--sa-font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    text-align: start;
    -webkit-font-smoothing: antialiased;
  }
  :host(:not([active])) {
    display: none;
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  .panel {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    block-size: 100%;
    overflow: auto;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-block-end: 1px solid var(--_sa-border);
  }
  header > div:first-child {
    display: grid;
    min-inline-size: 0;
    gap: 0.125rem;
  }
  header strong,
  .source-identity h2 {
    margin: 0;
    overflow-wrap: anywhere;
    font: 500 0.8125rem/1.5 var(--_sa-mono);
    letter-spacing: -0.015em;
  }
  .source-identity {
    flex: 1 1 12rem;
  }
  .source-facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    color: var(--_sa-secondary);
    font-size: 0.75rem;
  }
  .source-context {
    max-inline-size: 100%;
    min-inline-size: 0;
  }
  .source-context p {
    max-inline-size: 70ch;
    overflow-wrap: anywhere;
  }
  .source-context summary {
    font-family: var(--_sa-mono);
  }
  .header-actions,
  .filter {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .header-actions {
    margin-inline-start: auto;
  }
  .filter {
    font-size: 0.75rem;
    color: var(--_sa-secondary);
  }
  .eyebrow,
  .category {
    color: var(--_sa-secondary);
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0.065em;
    text-transform: uppercase;
  }
  .category {
    color: var(--_sa-accent);
  }
  button,
  input,
  select,
  textarea {
    color: inherit;
    font: inherit;
    background: var(--_sa-bg);
    border: 1px solid var(--_sa-border);
    border-radius: 6px;
  }
  button,
  input,
  select {
    min-block-size: 2rem;
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
  }
  button {
    cursor: pointer;
    font-weight: 500;
  }
  button:hover:not(:disabled) {
    background: var(--_sa-muted);
    border-color: color-mix(in srgb, var(--_sa-secondary) 50%, var(--_sa-border));
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  :is(button, input, select, textarea, summary, .source-scroll):focus-visible {
    outline: 2px solid var(--_sa-accent);
    outline-offset: 3px;
  }
  .primary {
    color: var(--_sa-on-accent);
    background: var(--_sa-accent);
    border-color: var(--_sa-accent);
  }
  .primary:hover:not(:disabled) {
    color: var(--_sa-on-accent);
    background: var(--_sa-accent);
    filter: brightness(0.94);
  }
  label {
    color: var(--_sa-secondary);
    font-size: 0.75rem;
  }
  textarea {
    display: block;
    inline-size: 100%;
    min-block-size: 6rem;
    padding: 0.75rem;
    resize: vertical;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--_sa-text);
  }
  .scope {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.75rem 1.25rem;
    border-block-end: 1px solid var(--_sa-border);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
  .scope span,
  .state,
  .create-note {
    color: var(--_sa-secondary);
  }
  .notice {
    padding: 0.875rem 1.25rem;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
  }
  .error {
    color: var(--_sa-danger);
    background: color-mix(in srgb, var(--_sa-danger) 6%, var(--_sa-bg));
    border-block-end: 1px solid color-mix(in srgb, var(--_sa-danger) 20%, var(--_sa-border));
  }
  .warning {
    color: var(--_sa-warning);
    background: color-mix(in srgb, var(--_sa-warning) 6%, var(--_sa-bg));
  }
  .state,
  .create-note {
    margin: 0;
    padding: 1rem 1.25rem;
    font-size: 0.8125rem;
  }
  .items {
    display: grid;
    gap: 0.875rem;
    padding: 1.25rem;
  }
  .item,
  .create {
    display: grid;
    gap: 0.875rem;
    padding: 1.25rem;
    border: 1px solid var(--_sa-border);
    border-radius: 8px;
    background: var(--_sa-bg);
  }
  .item-head,
  .actions,
  .range {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }
  .state-label,
  .author,
  .placement-label {
    color: var(--_sa-secondary);
    font-size: 0.75rem;
  }
  .author {
    margin-inline-start: auto;
  }
  .body {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.65;
  }
  .placement {
    display: grid;
    gap: 0.125rem;
    padding: 0.75rem;
    border-inline-start: 2px solid var(--_sa-accent);
    background: var(--_sa-surface);
    font-size: 0.75rem;
  }
  .placement.moved {
    border-color: var(--_sa-warning);
  }
  .placement.stale,
  .placement.unplaced {
    border-color: var(--_sa-danger);
  }
  .placement span,
  .provenance {
    color: var(--_sa-secondary);
  }
  .provenance {
    display: grid;
    gap: 0.125rem;
    font: 0.6875rem/1.65 var(--_sa-mono);
    overflow-wrap: anywhere;
  }
  summary {
    inline-size: fit-content;
    cursor: pointer;
    color: var(--_sa-secondary);
    font-size: 0.75rem;
    min-block-size: 1.5rem;
  }
  .original pre,
  .preview pre {
    max-block-size: 8rem;
    margin: 0.5rem 0 0;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: 0.75rem/1.6 var(--_sa-mono);
  }
  .actions {
    justify-content: flex-end;
  }
  .actions .danger {
    color: var(--_sa-danger);
    margin-inline-start: auto;
  }
  .create {
    margin: 0 1.25rem 1.25rem;
    background: var(--_sa-surface);
  }
  .create h3,
  .create p {
    margin: 0;
  }
  .create h3,
  .source-create h3 {
    font-size: 0.875rem;
    font-weight: 600;
  }
  .create p {
    color: var(--_sa-secondary);
    font-size: 0.8125rem;
  }
  .create label,
  .source-create label {
    display: grid;
    gap: 0.375rem;
  }
  .range label {
    flex: 1 1 7rem;
    min-inline-size: 0;
  }
  .range input {
    inline-size: 100%;
  }
  .preview {
    padding: 0.75rem;
    border: 1px solid var(--_sa-border);
    border-radius: 6px;
  }
  .preview > span {
    color: var(--_sa-secondary);
    font-size: 0.75rem;
  }
  .selection-hint {
    display: flex;
    align-items: center;
    margin: 0;
    color: var(--_sa-secondary);
  }
  /* Reserve the action row before a text drag starts: showing Add must not
     move source lines away from the pointer midway through a native selection. */
  .selection-hint,
  .selection-tools {
    min-block-size: calc(3.5rem + 1px);
    padding: 0.75rem 1.25rem;
    font-size: 0.75rem;
  }
  .source-scroll {
    min-inline-size: 0;
    overflow: auto;
    overscroll-behavior-inline: contain;
  }
  .source-document {
    min-inline-size: 100%;
    padding-block: 1rem;
  }
  .source-row {
    display: grid;
    grid-template-columns: 3.75rem minmax(0, 1fr);
    min-inline-size: max-content;
    align-items: start;
  }
  .source-row.selected {
    background: color-mix(in srgb, var(--_sa-accent) 9%, var(--_sa-bg));
  }
  .gutter {
    inline-size: 100%;
    min-block-size: var(--sa-line-height, 1.5rem);
    padding: 0 0.75rem;
    color: var(--_sa-secondary);
    background: transparent;
    border: 0;
    border-inline-end: 1px solid var(--_sa-border);
    border-radius: 0;
    font: var(--sa-code-size, 0.8125rem)/var(--sa-line-height, 1.5rem) var(--_sa-mono);
    text-align: end;
    user-select: none;
  }
  .gutter:focus-visible {
    outline-offset: -2px;
  }
  .source-code {
    display: block;
    min-block-size: var(--sa-line-height, 1.5rem);
    padding-inline: 1.25rem;
    font: var(--sa-code-size, 0.8125rem)/var(--sa-line-height, 1.5rem) var(--_sa-mono);
    white-space: pre;
    tab-size: 2;
  }
  .syntax-keyword {
    color: var(--sa-syntax-keyword, var(--_sa-accent));
  }
  .syntax-string {
    color: var(--sa-syntax-string, light-dark(#357149, #97cba6));
  }
  .syntax-number {
    color: var(--sa-syntax-number, var(--_sa-warning));
  }
  .syntax-comment {
    color: var(--_sa-secondary);
    font-style: italic;
  }
  .syntax-identifier {
    color: var(--_sa-text);
  }
  .selection-tools,
  .annotation-jumps,
  .page-nav {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    color: var(--_sa-secondary);
    border-block-end: 1px solid var(--_sa-border);
  }
  .selection-tools {
    justify-content: space-between;
    background: var(--_sa-surface);
  }
  .annotation-jumps,
  .page-nav {
    padding: 0.75rem 1.25rem;
    font-size: 0.75rem;
  }
  .page-nav {
    justify-content: center;
    border-block-start: 1px solid var(--_sa-border);
  }
  .empty-source {
    margin: 0;
    padding: 3rem 1.25rem;
    color: var(--_sa-secondary);
    text-align: center;
  }
  .virtual-annotation {
    display: grid;
    grid-template-columns: 3.75rem minmax(0, 1fr);
    min-inline-size: 0;
    margin-block: 0.625rem;
    border-block: 1px solid var(--_sa-border);
    background: var(--_sa-surface);
  }
  .virtual-marker {
    padding: 1rem 0.75rem;
    color: var(--_sa-accent);
    border-inline-end: 1px solid var(--_sa-border);
    text-align: end;
    font: 0.8125rem/1.5 var(--_sa-mono);
    user-select: none;
  }
  .virtual-content {
    display: grid;
    min-inline-size: 0;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
  }
  .virtual-content .body {
    max-inline-size: 86ch;
    font-size: 0.875rem;
  }
  .resolved .category {
    color: var(--_sa-secondary);
  }
  .virtual-content textarea {
    min-block-size: 8rem;
  }
  .note-details .provenance {
    margin-block: 0.75rem;
  }
  .note-details .actions {
    margin-block-start: 0.875rem;
  }
  .source-create {
    display: grid;
    min-inline-size: 0;
    gap: 1rem;
    margin: 0.75rem 1.25rem 1rem 3.75rem;
    padding: 1.25rem;
    border: 1px solid var(--_sa-accent);
    border-radius: 8px;
    background: var(--_sa-bg);
  }
  .source-create h3 {
    margin: 0;
  }
  .source-create textarea {
    min-block-size: 8rem;
  }
  .source-create details > label {
    margin-block-start: 0.5rem;
  }
  .stale-notes {
    margin: 1rem 1.25rem;
    border: 1px solid var(--_sa-border);
    border-radius: 8px;
    background: var(--_sa-surface);
  }
  .stale-notes > summary {
    inline-size: 100%;
    padding: 1rem;
  }
  .stale-notes > p {
    margin: 0;
    padding: 0 1rem 0.5rem;
    color: var(--_sa-secondary);
    font-size: 0.75rem;
  }
  .stale-notes .items {
    padding: 0.5rem 1rem 1rem;
  }
  @container source-annotations (inline-size < 560px) {
    header {
      padding: 1rem;
      gap: 0.75rem;
    }
    .header-actions {
      margin-inline-start: 0;
    }
    .scope {
      display: grid;
    }
    .source-create {
      margin-inline: 1rem;
      padding: 1rem;
    }
    .source-row,
    .virtual-annotation {
      grid-template-columns: 3rem minmax(0, 1fr);
    }
    .source-code {
      padding-inline: 1rem;
    }
    .virtual-content {
      padding: 1rem;
    }
    .author {
      margin-inline-start: 0;
      inline-size: 100%;
    }
    .actions {
      gap: 0.5rem;
    }
    .actions button {
      min-block-size: 2.25rem;
    }
  }
  @media (pointer: coarse) {
    button:not(.gutter),
    select {
      min-block-size: 2.5rem;
    }
    .selection-hint,
    .selection-tools {
      min-block-size: calc(4rem + 1px);
    }
  }
  @media (forced-colors: active) {
    .source-row.selected {
      outline: 1px solid Highlight;
      outline-offset: -1px;
    }
  }
`;
