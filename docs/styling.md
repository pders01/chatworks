# Styling Chatworks

Chatworks components ship an enhanced browser-default baseline. System fonts and
colors, readable spacing, native-sized controls, focus visibility, and modest
surface treatment keep them usable in a bare document. The baseline is not a
brand or product shell: embedding applications can replace layout and
presentation through the exposed parts.

## CSS parts

Shadow-DOM elements that need presentation expose a `part` matching their
semantic class name. These names are public API. Repeated elements share a part,
and an element can expose several tokens:

```html
<!-- conceptual rendered shapes -->
<li part="option active">…</li>
<div part="line addition">…</div>
<div part="toast error">…</div>
```

Style base and state tokens independently:

```css
cw-combobox::part(input) {
  color: var(--app-text);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
}

cw-combobox::part(active) {
  background: var(--app-selected);
}

cw-diff-view::part(addition) {
  background: var(--app-diff-addition);
}
```

Common groups include:

- attachment: `attachment-chip`, `is-image`, `is-file`, `removable`,
  `attachment-thumb`, `attachment-glyph`, `attachment-meta`, `attachment-name`,
  `attachment-size`, and `attachment-remove`;
- composer: `composer`, `composer-inner`, `input`, `mention-picker`,
  `mention-list`, `mention-item`, `slash-list`, `slash-item`, `attachment`,
  `attachment-strip`, `send`, `stop`, and `command-help`;
- tool events: `tool-event`, `running`, `done`, `error`, `tool-event-head`,
  `tool-dot`, `tool-name`, `tool-summary`, `tool-caret`, `tool-body`,
  `tool-body-label`, `tool-body-pre`, and `is-error`;
- thinking disclosures: `thinking-block`, `is-streaming`, `thinking-head`,
  `thinking-label`, `thinking-caret`, and `thinking-body`;
- chat turns: `turn`, `user`, `assistant`, `system`, `turn-label`, `turn-model`,
  `turn-actions`, `body`, `md`, `cursor`, `token-info`, `turn-attachments`,
  `turn-warnings`, and nested primitive parts;
- messages: `messages`, `turn-action`, `primary`, `edit-input`, `edit-actions`,
  chat-turn parts, thinking-disclosure parts, tool-event parts, and attachment
  parts;
- sessions and settings: controls expose their semantic names plus state tokens
  such as `selected`, `pinned`, `confirming`, `active`, and `danger`;
- diffs: `viewport`, `diff`, `file`, `hunk`, `line`, `addition`, `deletion`,
  `gutter`, `marker`, `code`, `word-add`, and `word-del`;
- overlays and feedback: `backdrop`, `palette`, `command`, `toast`, `info`,
  `success`, `warn`, `error`, `icon`, and `close`;
- workbench: `navigation`, `item`, `active`, `mount`, `surface`, `empty`,
  `loading`, and `error`.

Composed components forward relevant nested parts with `exportparts`. Styling a
part on `<cw-chat-view>` therefore reaches its built-in dashboard, session list,
message list, and composer. Lower-level components can also be imported and
styled directly.

## Composition slots

`<cw-chat-turn>` accepts caller-owned controls in its `actions` slot and an
optional replacement for the rendered message body in its `body` slot. The
message-list compatibility wrapper uses these slots for copy/edit/retry controls
and its editor while retaining ordering, action eligibility, and scroll state.
Applications using the primitive directly can supply their own controls without
adding action-policy properties to the turn component.

## Syntax presentation

The default highlighter escapes code and wraps each line without inline styles.
Applications may install a trusted renderer explicitly:

```ts
import { setSyntaxHighlighter } from "@jpahd/chatworks/highlight";

setSyntaxHighlighter((code, language) => renderTrustedCode(code, language));
```

A host renderer can expose syntax parts in its returned HTML, for example
`part="syntax-token syntax-keyword"`. Chatworks preserves `part` and `class`
when sanitizing markdown but strips inline styles, scripts, frames, and event
handlers. Applications should attach syntax presentation to the exposed parts.
