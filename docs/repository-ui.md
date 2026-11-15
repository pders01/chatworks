# Repository UI primitives

Transport-free Lit components salvaged from the retired Pi WebUI. These are
independent browser primitives, **not** a new application, workbench, editor,
repository service, or feature-parity claim. MIT; original sources and the
non-componentized lessons are catalogued in
[Pi WebUI interaction lessons](pi-webui-interaction-lessons.md).

## Entry and dependencies

The optional public subpath `@jpahd/chatworks/repository-ui` resolves to
`dist/repository-ui/index.{js,d.ts}`; its source entry is
`src/repository-ui/index.ts`. It is not included in the default barrel.
Importing this browser entry registers four elements:

| Export                                     | Element / responsibility                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `CwFileTabs`                               | `cw-file-tabs`: local open-file navigation, close, keyboard/pointer reorder  |
| `CwFilePicker`                             | `cw-file-picker`: debounced bounded filename search in a native modal dialog |
| `SourcePreviewController`                  | Host-owned UI snapshot cache, request fences, explicit refresh               |
| `CwSourcePreview`                          | `cw-source-preview`: scoped plaintext read-only source, facts, copy          |
| `CwRepositoryTree`                         | `cw-repository-tree`: lazy native disclosure/list composition                |
| `FileTabDragController`, `reorderFileTabs` | Reusable tab drag behavior and immutable reordering                          |

Public types: `FileTab`, `FileTabsChange`, `RepositoryScope`, `FileIdentity`,
`FileSearchClient`, `FileSearchResult`, `SourcePreviewClient`, `SourcePreview`,
`SourcePreviewState`, `RepositoryTreeClient`, `RepositoryTreeResult`,
`RepositoryEntry`. The entry also exports each numeric budget listed below.

Runtime imports are only `lit`, `lit/decorators.js`,
`lit/directives/repeat.js`, other files in this directory, and the existing
Chatworks browser-style foundation. No new package
dependency, SourceAnnotationPanel dependency, generated protocol import, Pi
runtime, global RPC client, storage, socket, filesystem, or syntax engine is
required. The entry is browser-only (custom elements), not a Node/headless entry.
A host adapter can wrap repository-core or RPC; native repository data semantics
and editor integration stay in the headless package monorepo.

The package marks source and compiled modules in this directory as side effects
to preserve custom-element registration. Browser fixtures and declaration tests
consume the public compiled export; the explicit-artifact packed check independently checks
actual tarballs, shared Lit identity and browser graph boundaries.

## Scope is identity, not a label

```ts
import {
  SourcePreviewController,
  type RepositoryScope,
  type FileSearchClient,
} from "@jpahd/chatworks/repository-ui";

const scope: RepositoryScope = {
  repositoryId: "host-owned-stable-repository-id",
  ref: "host-resolved-immutable-snapshot-id",
};

const picker = document.querySelector("cw-file-picker")!;
picker.scope = scope;
picker.client = searchClient; // FileSearchClient
picker.open = true;
picker.addEventListener("cw:file-open", ({ detail }) => {
  // Host decides navigation and whether to read a source; no automatic side effect.
  void previews.open("main-reader", detail);
});

const previews = new SourcePreviewController(previewClient);
document.querySelector("cw-source-preview")!.controller = previews;
```

Resolve moving names such as `HEAD` or branch labels **before** assigning a
scope. Refs are opaque: the UI does not guess immutability from a hex regex.
Every search/tree response must echo the requested immutable ref; every preview
must also echo the exact path. A mismatch becomes an error rather than silently
relabelling content. Repository IDs separate identically named paths/refs in
different repositories. Assign new scope objects; do not mutate bound input
objects in place.

Client identity is part of the async fence. A host must replace the client when
its connection, authorization, or repository routing changes, instead of
silently retargeting existing closures. A request must capture its original
scope; it must not read a later selected repository inside a promise callback.
Abort signals are resource hints, **not** the correctness mechanism: stale
results are rejected even when a client ignores abort.

### Injected clients

- `search(scope, query, { limit, signal })` returns `{ ref, paths, truncated,
incomplete }`.
- `preview(fileIdentity, { maxBytes, signal })` returns `{ ref, path, content,
binary, truncated, size?, language? }`.
- `children(scope, directoryPath, { limit, signal })` returns `{ ref, entries,
truncated, incomplete }`. Root is `""`; child paths are full repository-relative
  paths. Entries have `{ path, name, kind: "file" | "directory" }`.

These are structural UI interfaces, not new backend protocols. Adapters must
implement bounded reads at the service/native boundary and preserve factual
flags. Frontend slicing does not make an unbounded backend operation safe.
Missing `size` is rendered as unknown, not guessed from JavaScript string length.

## Tabs

```ts
const tabs = document.querySelector("cw-file-tabs")!;
tabs.tabs = [
  { id: "immutable-file-identity", label: "reader.ts", description: "src/reader.ts at snapshot A" },
];
tabs.activeId = tabs.tabs[0].id;
tabs.addEventListener("cw:file-tabs-change", ({ detail }) => {
  // Mirror detail.tabs / detail.activeId if using a host store.
  // Capture/restore the host-owned document position when detail.action === "select".
});
```

Provide unique stable IDs that include the host's complete file identity (not
just basename). The component changes its navigation properties on interaction
and emits `{ action: "select" | "close" | "reorder", id, tabs, activeId }`.
External assignments do not emit synthetic interaction events. Invalid active
IDs normalize to the first tab. Closing the active tab selects its next neighbor
or the previous last tab. No tabs leaves the component programmatically focused;
the host may move focus to its file index after handling close.

The default slot is a **single host-owned panel**. It is not duplicated or
remounted on reorder; the host owns its source contents, drafts, scroll positions
and loading policy. Tabs and their panel are in the same shadow-root ARIA scope.
Arrow Left/Right wraps; Home/End select endpoints; Delete closes;
Alt+Shift+Left/Right reorders with a live announcement. IME/modifier chords are
not commandeered. Pointer reorder has a movement threshold, edge auto-scroll,
Escape/cancel cleanup, obsolete-tab-list cancellation and post-drag click
suppression. Touch labels retain native horizontal scrolling; only the grip has
`touch-action: none`. There is no drag dependency.

## File picker

`open` defaults false. A host toggles it to show a native `dialog.showModal()`;
Escape/close/selection set it false and emit `cw:file-picker-close`. Selection
also emits `cw:file-open` with `{ repositoryId, ref, path }`. Native modal focus
containment and return-to-invoker are used; there is no manual focus trap.

Search debounces by `FILE_PICKER_DEBOUNCE_MS = 120`, clamps query input to 128
UTF-16 code units and displays at most `FILE_PICKER_LIMIT = 100` unique paths.
Query, sequence, client, repository, ref, open state and connection state fence
publication **and selection**. Changing scope clears old options immediately on
the next render; an old option clicked before that render is also rejected.
Closing/disconnecting invalidates pending work. Reconnect can re-search.

The input retains focus and uses a combobox/listbox active descendant.
Arrow Up/Down changes selection, Enter opens, IME composition does not submit.
Truncation means “more matches, refine query”; incomplete enumeration means
“listing budget reached, absence is not conclusive.” Both notices can coexist.
Errors, empty results and missing scope/client are separate states.

## Source preview

`SourcePreviewController` owns UI snapshots keyed by a host-selected `surfaceId`,
not Pi sessions. `open(surfaceId, file, scrollTop?)` explicitly requests a read.
`selectSurface(id)` only selects a cached surface; it never auto-refreshes.
`refresh(expectedState?)` re-reads the same immutable identity and retains scroll.
`close(id?)` deletes that surface and invalidates its pending request.
`setClient(newClient)` invalidates all cached/pending reads.
`dispose()` permanently empties the cache and aborts outstanding work.

State objects, file identities and preview objects are frozen snapshots. A late
read cannot overwrite a newer file, closed surface, evicted surface or replaced
client. Completion of an inactive surface is cached without notifying the active
reader. Cache capacity is `SOURCE_PREVIEW_MAX_SURFACES = 20` in insertion order;
reopening makes a surface newest. Selecting an evicted surface shows empty state.
Hosts should close surfaces deliberately rather than rely on eviction.

Reads request `SOURCE_PREVIEW_MAX_BYTES = 262144` bytes from the client. A separate
`SOURCE_PREVIEW_MAX_CHARS = 262144` UTF-16 code-unit display cap is defensive against
an over-returning client; it sets `truncated` truthfully. This is not a UTF-8 byte
counter. Backend adapters must enforce the byte budget before decoding.

`cw-source-preview` subscribes while connected; removing it unsubscribes but does
not dispose its host-owned controller. The host is responsible for disposal.
Back emits `cw:source-preview-close` with the captured file identity (it does not
change host navigation). Refresh re-reads explicitly. Copy writes **only displayed
source text**, not DOM, headers, notes or invented ellipses, and reports truncated
copy as such. Late clipboard status cannot appear on a different source.
`rememberScroll` records only ready-state positions; loading scroll events cannot
clobber a saved ready position.

This view is plaintext by design: literal source is Lit-bound text, with no
`unsafeHTML` or mandatory optional-highlighter loading phase. Binary, empty,
loading, error and truncated states stay distinct. `language` is metadata only.
Use the separately migrated `SourceAnnotationPanel` for line/range selections,
virtual sources and note editing—this component does not duplicate that logic.

## Lazy browser

`cw-repository-tree` has `client` and `scope` properties and `refresh()`.
It renders a native nested list of `details`/`summary` directories and file
buttons, **not** a partial ARIA `role=tree` keyboard implementation. Standard Tab,
Enter and Space disclosure behavior belongs to the browser. File activation
emits `cw:file-open`; it does not read a preview, navigate a route or switch tabs.

Directory children load on first expansion and cache until explicit refresh or
client/scope change. DOM identity includes request generation, repository ID,
immutable ref and full path. Same-named directories in a new scope do not inherit
old native open state. Duplicate or non-direct-child paths in the bounded visible slice are rejected,
not merged by display name. Validation/deduplication processing is bounded before
walking over-returned arrays. Failed directories expose retry. Empty directories are
only called empty when neither truncation nor incompleteness undermines that fact.

Budgets: `REPOSITORY_TREE_CHILD_LIMIT = 100`,
`REPOSITORY_TREE_ROW_LIMIT = 500` across loaded branches, and
`REPOSITORY_TREE_DEPTH_LIMIT = 12`. Limit notices direct users to file search.
No full-repository eager walk, branch/ref resolver, annotations count aggregation,
comparison orchestrator, blame renderer or repository view shell is included.

## Presentation and compatibility

The four components use system colors (`Canvas`, `CanvasText`, `ButtonFace`,
`Highlight`), visible focus, native controls, horizontal tab overflow and
narrow-width wrapping. Hosts should set `color-scheme: light dark`; there is no
global theme mutation. No syntax color palette or Pi design-system dependency is
copied. Stable styling parts:

- Tabs: `tablist`, `tab`, `active`, `grip`, `select`, `close`, `panel`.
- Picker: `dialog`, `header`, `input`, `results`, `option`, `selected`, `status`, `error`.
- Preview: `preview`, `header`, `scroll`, `source`, `facts`, `error`, `empty`, `copy-status`.
- Browser: `tree`, `file`, `directory`, `notice`.

The height tokens are `--cw-source-preview-height` and
`--cw-repository-tree-height` (both default `30rem`). Tabs use
`--cw-border-color` when supplied. Styles stay in shadow DOM; hosts can use parts
rather than depend on internal class names.

Requires a modern browser with Lit 3, custom elements, shadow DOM, native dialog,
Pointer Events/capture, AbortController and system colors. Clipboard copying
requires browser permission and a secure context; failure is reported in place.
No dialog/polyfill dependency is bundled. Chromium verification does not certify
Firefox, WebKit, screen readers, actual touchscreen gesture physics, forced
colors or packed-browser behavior. Artifact checks are a separate gate.

## Reproducible synthetic checks

From the Chatworks root, after [explicit artifact setup](development-artifacts.md):

```sh
npm run test:repository-ui
npm run test:package -- /absolute/path/to/repokit-tarballs
node_modules/.bin/oxlint -c oxlintrc.json src/repository-ui/
```

The browser command first builds Chatworks and checks public consumer declarations.
The fixture imports **@jpahd/chatworks/repository-ui**, not TypeScript source, a
source alias or a separate feature build. To inspect it manually after building:

```sh
node_modules/.bin/vite --config examples/repository-ui/vite.config.ts
# http://127.0.0.1:5199/examples/repository-ui/
```

The dedicated loopback server uses port **5199**, `strictPort: true`,
`envDir: false`, no reuse of an existing server and no backend. All fixtures are
in-memory, synthetic and deterministic. No live repositories, secrets or private
application storage are read. Screenshot cases generate separate tabs, picker,
preview and browser PNGs for light/dark × wide (1280px)/narrow (390px) under
`tests/repository-ui/screenshots/`. These are review artifacts, not pixel baseline
assertions or a substitute for behavior tests.

The browser suite carries forward the original reorder and preview-controller
race/fact invariants, adapted from Pi tests cited in the lessons document. It
adds compiled-component focus, native-dialog, async picker, tree identity and
layout checks. The original async syntax-highlight supersession scenario is not
a copied feature: there is no async highlighter in this plaintext reader.
