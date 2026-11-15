# Repository UI

`@jpahd/chatworks/repository-ui` is an experimental browser-only entry, absent
from the default barrel. It registers four Lit elements and exports structural
client contracts, a preview controller and tab reorder helpers. No protocol,
filesystem, network, storage, syntax engine or annotation service is imported.

| Export                                     | Responsibility                                               |
| ------------------------------------------ | ------------------------------------------------------------ |
| `CwFileTabs` / `cw-file-tabs`              | Open-file navigation, close and keyboard/pointer reorder     |
| `CwFilePicker` / `cw-file-picker`          | Bounded filename search in a native modal dialog             |
| `CwSourcePreview` / `cw-source-preview`    | Read-only plaintext preview, facts and copy                  |
| `CwRepositoryTree` / `cw-repository-tree`  | Lazy native directory disclosures                            |
| `SourcePreviewController`                  | Host-owned UI snapshots, request fences and explicit refresh |
| `FileTabDragController`, `reorderFileTabs` | Reusable drag behavior and immutable reordering              |

```ts
import {
  SourcePreviewController,
  type RepositoryScope,
  type FileSearchClient,
  type SourcePreviewClient,
} from "@jpahd/chatworks/repository-ui";

function mountFiles(
  target: HTMLElement,
  scope: RepositoryScope,
  searchClient: FileSearchClient,
  previewClient: SourcePreviewClient,
) {
  const previews = new SourcePreviewController(previewClient);
  const picker = document.createElement("cw-file-picker");
  picker.scope = scope;
  picker.client = searchClient;
  picker.addEventListener("cw:file-open", ({ detail }) => void previews.open("main", detail));
  const source = document.createElement("cw-source-preview");
  source.controller = previews;
  target.append(picker, source);
  picker.open = true; // Usually set by a host-owned Open file button.
  return previews; // Dispose when this host view is destroyed.
}
```

## Scope and client contracts

`RepositoryScope` is `{ repositoryId, ref }`; `FileIdentity` also includes `path`.
The host must resolve moving names such as HEAD/branches **before** assigning
scope. Refs are opaque: the UI does not infer immutability from a hex pattern.
Search/tree responses must echo the exact ref; previews must also echo the exact
path. Mismatches are errors, not silently relabeled content.

Assign new objects rather than mutating bound inputs. Replace clients when their
connection, authority or repository routing changes. Requests must capture their
original scope, not read later selection inside a callback. Abort signals are
resource hints; stale-response fences remain necessary even if clients ignore them.

| Client method                                       | Result                                                        |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `search(scope, query, { limit, signal })`           | `{ ref, paths, truncated, incomplete }`                       |
| `preview(file, { maxBytes, signal })`               | `{ ref, path, content, binary, truncated, size?, language? }` |
| `children(scope, directoryPath, { limit, signal })` | `{ ref, entries, truncated, incomplete }`                     |

Tree root is `""`. Entries contain `{ path, name, kind: "file" | "directory" }`
with full repository-relative paths. These are UI interfaces, not a new backend
protocol. Host adapters must bound service/native work before returning data;
frontend slicing does not make unbounded backend work safe. Missing `size` means
unknown, not JavaScript string length.

## File tabs

Set `tabs: FileTab[]` with unique stable IDs for the complete file identity,
labels and descriptions; set `activeId` for selection. Interaction
updates navigation properties and emits `cw:file-tabs-change` with
`{ action: "select" | "close" | "reorder", id, tabs, activeId }`. External property
assignments do not emit synthetic interactions. Invalid active IDs normalize to
the first tab; closing the active tab selects its next neighbor or previous last.

The default slot is **one host-owned panel**, not a panel remounted per tab or
reorder. Hosts own its content, drafts and scroll restoration. Closing the last
tab through interaction returns focus to the component unless the host already
moved focus elsewhere. Assigning an empty array does not itself move focus.

Arrow Left/Right wraps; Home/End select endpoints; Delete closes;
Alt+Shift+Left/Right reorders with a live announcement. Pointer reorder has a
movement threshold, edge auto-scroll, Escape/cancel cleanup and post-drag click
suppression. A separate touch grip uses `touch-action: none`; labels retain
native horizontal scrolling. IME/modifier chords are not commandeered.

`reorderFileTabs(tabs, id, beforeId)` preserves existing tab objects; null appends.
Missing/self targets return the original array. Deferred focus respects host
focus decisions rather than stealing focus after an event handler runs.

## File picker

Set `client`, `scope` and `open` (default false). The component uses
`dialog.showModal()`, native focus containment and return-to-invoker; there is no
manual trap. Close/Escape/selection clear open and emit `cw:file-picker-close`.
Selection also emits `cw:file-open` with the captured `FileIdentity`; the host
chooses whether to navigate or read it.

Search debounces **120ms**, clamps input to **128 UTF-16 code units** and displays
at most **100 unique paths** (`FILE_PICKER_DEBOUNCE_MS`, `FILE_PICKER_LIMIT`).
Query/sequence/client/scope/open/connection state fence publication and selection,
including old options clicked before a changed scope renders. Closing/disconnect
invalidates pending work; reconnect can re-search.

The focused input uses combobox/listbox active-descendant navigation. Up/Down
moves selection; Enter opens; IME composition does not submit. `truncated` means
more matches exist; refine the query. `incomplete` means enumeration hit a budget;
absence is inconclusive. Both notices can coexist. Empty, error and unbound states
remain distinct.

## Preview controller and source view

`SourcePreviewController` extends `EventTarget`. Observe its `state` and
`surfaceId` getters and ordinary `"change"` event when writing a custom view:

- `open(surfaceId, file, scrollTop?)` explicitly reads a file.
- `selectSurface(id)` selects cached state without refreshing.
- `refresh(expectedState?)` re-reads the same identity and retains scroll. A
  supplied expected state must still be the exact current object.
- `close(id?)` deletes that surface and invalidates its pending read.
- `setClient(newClient)` invalidates all cached/pending reads.
- `dispose()` permanently empties the cache and aborts outstanding work.

States, file identities and previews are frozen snapshots. Late reads cannot
overwrite newer files, closed/evicted surfaces or replaced clients. An inactive
surface completion is cached without notifying the active view. The cache holds
**20 surfaces** in insertion order; reopening makes one newest. Selecting an
evicted surface is empty. Close deliberately rather than relying on eviction.

Reads request **262144 bytes** (`SOURCE_PREVIEW_MAX_BYTES`). A separate
**262144 UTF-16 code-unit** display cap (`SOURCE_PREVIEW_MAX_CHARS`) defends against
over-returning clients and marks truncation; it is not a UTF-8 byte counter.
`SOURCE_PREVIEW_MAX_SURFACES` exports the cache limit. Enforce byte budgets before
decoding in the backend.

`cw-source-preview` subscribes while connected but never disposes its host-owned
controller. Back emits `cw:source-preview-close` with the captured file identity;
it does not change navigation. Refresh is explicit. Copy includes **displayed
source only**, not headers, notes, DOM text or invented ellipses; truncated copy
is labeled and late clipboard status cannot leak to another file.
`rememberScroll` accepts ready-state positions only; it replaces the frozen state
without emitting change, so loading scroll cannot clobber saved position.

Literal Lit-bound plaintext is intentional: `language` is metadata, not an async
highlighter. Binary, empty, loading, error and truncated states remain distinct.
Use [source annotations](source-annotations.md) for line/range selection and notes.

## Lazy repository tree

Set `client` and `scope`; call `refresh()` explicitly. Native nested
`details`/`summary` lists use browser Tab/Enter/Space behavior, not a partial ARIA
`role=tree` implementation. File activation emits `cw:file-open`, without routing,
preview reads or tab changes.

Children load on first expansion and cache until refresh or client/scope change.
Generation/repository/ref/full-path identity prevents new scopes inheriting old
open state. Duplicate/non-direct-child paths in the bounded visible slice are
rejected; validation itself is bounded before walking over-returned arrays.
Failed directories expose retry. A directory is only empty when neither
truncation nor incomplete enumeration undermines that fact.

Limits: **100 children**, **500 loaded rows**, **12 levels**
(`REPOSITORY_TREE_CHILD_LIMIT`, `REPOSITORY_TREE_ROW_LIMIT`,
`REPOSITORY_TREE_DEPTH_LIMIT`). Limit notices direct users to file search.
No eager repository walk, ref resolver, blame or comparison orchestration is included.

## Styling and support

System colors follow ancestor `color-scheme`; native controls, visible focus,
horizontal tab overflow and narrow wrapping form the baseline. Stable parts:

- Tabs: `tablist`, `tab`, `active`, `grip`, `select`, `close`, `panel`.
- Picker: `dialog`, `header`, `input`, `results`, `option`, `selected`, `status`, `error`.
- Preview: `preview`, `header`, `scroll`, `source`, `facts`, `error`, `empty`, `copy-status`.
- Tree: `tree`, `file`, `directory`, `notice`.

`--cw-source-preview-height` and `--cw-repository-tree-height` default to `30rem`;
`--cw-border-color` customizes tab borders. Use parts, not internal class names.
Modern custom elements, shadow DOM, native dialog, CSS subgrid, Pointer Events/capture
and AbortController are required. Clipboard writes need secure context/permission and
report failure in place. No dialog polyfill is bundled.

Storybook and the [standalone fixture](https://github.com/pders01/chatworks/tree/main/examples/repository-ui)
use synthetic clients and public compiled exports. See
[contributing](https://github.com/pders01/chatworks/blob/main/CONTRIBUTING.md) for
setup/checks. Chromium coverage does not certify other browsers, assistive
technology, physical touch, forced colors or OS clipboard behavior.
