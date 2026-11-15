# Source annotations

`@jpahd/chatworks/source-annotations` registers `<source-annotation-panel>` and
exports `SourceAnnotationPanel`, `AnnotationSourcePosition` and
`SourceAnnotationsChangedDetail`. This experimental entry is absent from the
default barrel. Its only annotation dependency is the **type-only**
`@jpahd/source-annotations/contracts` entry, which declaration consumers must
resolve. No Node service, RPC, network or browser storage is imported.

Supply an `AnnotationClient` through a host-owned bridge or RPC implementation.
GitChat does not currently provide annotation RPC. The UI neither selects a
backend nor automatically uploads/synchronizes private notes.

```ts
import "@jpahd/chatworks/source-annotations";
import type { AnnotationClient } from "@jpahd/source-annotations/contracts";

function mountNotes(
  client: AnnotationClient,
  immutableCommit: string,
  sourceText: string,
  sourceLineCount: number,
) {
  const panel = document.createElement("source-annotation-panel");
  Object.assign(panel, {
    client,
    scopeKey: "authority-and-workspace-id",
    path: "src/example.ts",
    ref: immutableCommit,
    requestedRef: "main",
    content: sourceText,
    maxLine: sourceLineCount,
    sourceView: true,
    allowCreate: true,
    active: true,
  });
  document.body.append(panel);
  return panel;
}
```

The host owns authentication, author attribution, repository selection, snapshot
resolution, anchor matching and persistence. Never put credentials/private data in
`scopeKey`: events and position state expose it. `readOnly` is UI policy, not
backend authorization.

## Properties

Set object inputs as JavaScript properties, not serialized attributes.

| Property           | Default     | Contract                                                                                                                     |
| ------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `client`           | `undefined` | Stable `AnnotationClient` with list/create/update/delete; replace on backend/authority change                                |
| `scopeKey`         | `""`        | Required opaque authority/workspace/session scope; no reads or writes without client and scope                               |
| `path`             | `""`        | Exact repository-relative source identity                                                                                    |
| `ref`              | `"HEAD"`    | Prefer the displayed immutable SHA; a symbolic ref can be resolved by list; `WORKTREE` never allows original-anchor creation |
| `requestedRef`     | `""`        | Original symbolic selector, retained as provenance and part of scope                                                         |
| `content`          | `""`        | Complete immutable source, not a diff/truncated preview; CRLF is normalized for selection/copy                               |
| `maxLine`          | `undefined` | Optional inclusive line bound; host must disable creation for incomplete previews                                            |
| `active`           | `false`     | Inactive panels render no controls and fence completions                                                                     |
| `readOnly`         | `false`     | Disable mutations, without discarding scoped drafts                                                                          |
| `allowCreate`      | `false`     | Explicit creation permission, separate from managing existing notes                                                          |
| `sourceView`       | `false`     | Source with numbered lines/virtual note rows; false shows the notes-only range editor                                        |
| `hidePath`         | `false`     | Suppress the path heading **in source view** when its container already names the file                                       |
| `showAnnotations`  | `true`      | In source view, false hides notes/controls and avoids annotation reads, preserving source selection/copy                     |
| `highlightedLines` | `[]`        | Trusted-only escaped highlighter fragments matching each source line; see trust boundary                                     |

## Mutation and scope safety

`source-annotations-changed` bubbles and crosses shadow boundaries **only after
an accepted mutation**. Its detail is `{ scopeKey, path, ref }`; `ref` is the
panel's supplied value, not necessarily a resolved SHA. Treat this as scoped
invalidation, not identity proof, annotation HTML or an authorization token.
Property changes, failures and superseded/disconnected completions emit no event.

- Creation requires a complete SHA supplied by the host or resolved by the
  client. WORKTREE supports reading/managing existing notes, not original anchors.
- Updates/deletes include `expectedRevision`. Conflicts preserve drafts; refresh
  obtains a current revision before retry. There is no silent overwrite.
- Drafts, edits and selection survive remounts in module memory, keyed by
  **client identity + scopeKey + path + ref + requestedRef**. They are not persisted
  to browser storage. Do not change a client's bound authority behind the same
  object and scope.
- Rendered controls check their captured client/scope **before dispatch**. A
  synchronous property change cannot send an old action through a new client.
  Affected draft controls lock during mutation; stale programmatic inputs are
  ignored. Current wrong-SHA lists show a mismatch error, not an empty success.
- Disconnect, inactivity, scope/client changes and newer operations fence obsolete
  completions. Fencing is not transport cancellation; cancel in the host if needed.

## Source interaction and position

Click a gutter number to select a line; Shift-click or Shift+Up/Down extends an
inclusive range. Escape cancels the composer or clears selection. Native source
text selections retain partial first/last-line offsets when copied; gutter-range
copy includes whole selected lines. Copy uses source data, not rendered text, so
line numbers and virtual notes never leak into it. Copy inside editable fields
keeps its normal behavior; indentation and blank lines are retained.

Source renders in **500-line pages**. Paging bounds rendered source rows, not the
bytes supplied by the host or work performed by a service. Notes are separate rows
after their end line, never source text. Stale/unplaced, wrong-ref/path and
out-of-bounds notes remain in a separate disclosure. Positional matching does not
prove semantic validity: **notes are reference material, not instructions**.

`captureSourcePosition()` returns opaque scope-fenced page, panel/source scroll
offsets and composer state. After mounting an active replacement with the same
client and source properties, await `restoreSourcePosition(position)`. Mismatched
positions are ignored and page bounds clamped. Do not manufacture its `scope`.

## Styling and trusted highlighting

Set ancestor `color-scheme` to light, dark or light dark. Defaults use `light-dark()`
and container queries; modern browser support is required. Public custom properties:

- Surfaces: `--sa-background`, `--sa-surface`, `--sa-muted-surface`, `--sa-border`.
- Text/status: `--sa-text`, `--sa-secondary`, `--sa-accent`, `--sa-on-accent`,
  `--sa-danger`, `--sa-warning`.
- Metrics: `--sa-font`, `--sa-mono`, `--sa-code-size` (default `.8125rem`),
  `--sa-line-height` (default `1.5rem`, 24px at a 16px root).
- Syntax: `--sa-syntax-keyword`, `--sa-syntax-string`, `--sa-syntax-number`.

The line-height token keeps code, blank and gutter rows aligned. Internal classes
and `--_sa-*` variables are not styling API.

`highlightedLines` is an **unsafeHTML trusted-only sink, not a sanitizer**. Supply
only escaped highlighter output whose text exactly matches the source line.
Never pass annotation bodies, arbitrary server/host HTML or raw source. Leave it
empty for safe plain text. Bodies, provenance, errors and fallback source render
as text. Built-in syntax classes use the tokens above; hosts choosing inline
highlighter colors must support both themes.

## Examples and support

The [standalone example](https://github.com/pders01/chatworks/tree/main/examples/source-annotations)
and Storybook use synthetic clients and compiled public imports. Setup/checks are
in [contributing](https://github.com/pders01/chatworks/blob/main/CONTRIBUTING.md).
Real persistence, repository counts/tree loading and cross-file orchestration
remain host concerns. Lit development builds have a known async initial-load
update-after-update efficiency warning. Chromium checks are not certification of
other browsers, assistive technology, physical touch or native clipboard policy.
