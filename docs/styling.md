# Styling Chatworks

Chatworks components ship structural and accessibility-critical CSS only. The
embedding application owns colors, surfaces, typography, decorative borders,
radii, shadows, syntax treatment, and motion.

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

- composer: `composer`, `composer-inner`, `input`, `mention-picker`,
  `mention-list`, `mention-item`, `slash-list`, `slash-item`, `attachment-chip`,
  `send`, `stop`, and `command-help`;
- messages: `messages`, `turn`, `user`, `assistant`, `body`, `turn-action`,
  `thinking-block`, `tool-event`, and attachment parts;
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
