# Pi WebUI interaction salvage: disposition and invariants

This is a preservation record, not an application roadmap or feature-parity
claim. Browser UI belongs in Chatworks; native Git/data/editor contracts belong
in the headless package monorepo. The retired Pi application remains available
in the parent checkout's historical tag **`archive/pi-webui-application`**.
Paths below refer to that tag, not a promise that the retired application still
exists in the active tree. For example:

```sh
git show archive/pi-webui-application:src/app/file-tabs.ts
git show archive/pi-webui-application:src/repository/file-search-dialog.ts
```

All salvaged code is MIT under the project license. No private notes, live
application data, credentials, runtime session recordings or original machine
paths are fixtures. Screenshots and tests in the new extraction use deterministic
synthetic data. MIT authorization for code does not authorize publication of
private repository content or notes.

## Disposition map

| Original source / behavior                                                                                                               | Disposition                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/file-tabs.ts`, `src/app/file-tab-drag-controller.ts`                                                                            | Adapted in `src/repository-ui/`: standalone tabs plus retained drag controller and immutable reorder helper. No Pi/editor state.                                                                                                                 |
| `src/repository/file-search-dialog.ts`                                                                                                   | Adapted as `CwFilePicker`: injected client, native dialog, bounded search and complete async/action fences. Host must bind an immutable snapshot.                                                                                                |
| `src/workbench/file-surface-controller.ts`, `src/workbench/file-surface.ts`                                                              | Adapted as scoped `SourcePreviewController` / `CwSourcePreview`, with explicit refresh and plaintext rendering. No session/composer integration or async highlighter.                                                                            |
| `src/repository/repository-view.ts`                                                                                                      | Only a small lazy native-disclosure browser composition is implemented. Full browse/compare/blame/annotations orchestration is **not copied**.                                                                                                   |
| `packages/source-annotations-ui/src/source-annotation-panel.ts`, `src/annotations/annotation-panel.ts`                                   | Source annotation UI is migrated separately into Chatworks `src/source-annotations/index.ts`, retaining `SourceAnnotationPanel`. Do not reimplement selection/drafts/virtual notes in repository-ui. Pi adapter stays historical.                |
| `src/repository/portable/**`, `src/repository/commit-log-view.ts`, Pi Commits binding/route files                                        | Commits reader UI is migrated separately to Chatworks `src/commits-reader/index.ts`; portable headless contracts/state belong to `@jpahd/commits-core/contracts` and `/state`. Pi binding/routes are historical, not a new Chatworks dependency. |
| `src/knowledge/knowledge-view.ts`, `shared/context-prompt.ts`                                                                            | Concrete knowledge UI/prompt invariants below are retained as lessons; data/prompt selection belongs to headless context-records. No knowledge application copied.                                                                               |
| `src/extension-dialog.ts`, `src/extensions/extension-dialog-controller.ts`                                                               | Exact-request/origin/no-late-answer lessons only. No Pi extension dialog broker or application modal queue copied.                                                                                                                               |
| `src/agent/timeline/timeline-scroll-controller.ts`, `src/agent/timeline/thread-minimap.ts`                                               | Long-thread reading/follow lessons only. No Pi run/timeline/runtime/reducers copied. Existing Chatworks chat primitives remain separate.                                                                                                         |
| `src/syntax-highlight.ts`, `src/syntax-highlight-implementation.ts`, `src/design-system/chatworks.ts`                                    | Optional lazy syntax/semantic-token lessons only. Repository-ui uses literal plaintext; no mandatory Shiki/WASM/grammar dependency. Existing Chatworks highlighting hooks are not replaced.                                                      |
| `src/workbench/document-header.ts`, `src/design-system/tokens.css`, `src/design-system/presentation.ts`                                  | Document facts, hierarchy, contrast and narrow-width lessons below. No wholesale application design system or shell copied.                                                                                                                      |
| Application sessions/routes/composer/shell, permissions/broker/terminal handoff, comparison orchestration, run/timeline/runtime/reducers | Historical tag is the archive. They are not reusable UI contracts just because they contain HTML. No new app, backend or workbench is introduced here.                                                                                           |

[Repository UI API](repository-ui.md) documents **what is implemented**. The
sections below also preserve behavior that is **lessons only** or belongs to the
separate source-annotations/Commits migrations. A described invariant is not a
claim that repository-ui implements the corresponding feature.

## 1. Tree identity and lazy file-open intent

Original: `src/repository/repository-view.ts` (`immutableRef`, `toggleDirectory`,
`changeRef`, `openFile`), `e2e/repository.e2e.ts`, `e2e/repository-tabs.e2e.ts`.

**Implemented in bounded form.**

- A filename/basename is a label, not identity. Repository ID, immutable snapshot
  and full repository-relative path identify a source. Same path at a different
  snapshot is a different source, not a relabelled existing source/draft.
- Resolve moving refs before requesting children or opening a source. Capture
  request generation, scope and client. Late directory loads must not patch a
  new tree with old children. Tree loading must not override a later user
  selection, a closed tab or a mode switch.
- In the extraction, native disclosure DOM keys include \*\*generation + repository
  - ref + path\*\*. Merely replacing a data array while keying by path can preserve
    an old `<details open>` in a different repository. Reset on scope/client/refresh.
- Lazy means request children only when expanding, cache within that scope, and
  retry a failed directory explicitly. Do not eagerly traverse the repository to
  draw a sidebar. UI and service both need budgets. Show truncation/incompleteness
  rather than claiming the filtered or partial listing is complete.
- Duplicate paths or non-direct-child paths are errors, not permission to merge
  same-named nodes. Directory labels are escaped text, not a selector key.
- Opening a file is a host-owned intent carrying immutable identity. Loading a
  tree must not implicitly open files, change routes, read editors or write notes.
- A small browser should use native nested lists/disclosures. Do not add
  `role=tree` unless implementing its complete roving/tree keyboard interaction.
  The extracted browser deliberately makes no ARIA-tree-widget claim.

**Lessons only:** branch menus, detached-HEAD policy, cross-reference navigation,
annotation-count aggregation and complete browse/compare shell composition.

## 2. File tabs: navigation without editor-buffer semantics

Original: `src/app/file-tabs.ts`, `src/app/file-tab-drag-controller.ts`,
`src/app/file-tab-drag-controller.test.ts`, `e2e/file-tabs.e2e.ts`,
`e2e/file-tabs-drag.e2e.ts`, `e2e/file-tabs-visual.e2e.ts`.

**Implemented.**

- Key by stable source identity. Reordering retains the original tab/draft
  objects; never reconstruct file contents from tab labels. Self/stale targets
  leave the original array unchanged. Navigation is not an editor save model.
- Maintain one selected tab and a roving tab stop, explicit tab/panel association,
  Left/Right wrapping, Home/End and Delete. Ignore IME composition and unrelated
  modifier chords. Keep accessible names descriptive when basenames collide.
- Closing a focused tab hands focus to the selected survivor **after the host's
  render**, rather than dropping it on the document body. Closing the last tab
  hands focus to a stable index/host target. Do not steal focus if the user has
  already moved it elsewhere.
- Reordering has a keyboard equivalent (Alt+Shift+Left/Right) and a polite position
  announcement. A successful drag must not then trigger a stale selection click.
- The touch label is a **scroll surface** (`touch-action: pan-x`); the separate
  grip is the only `touch-action: none` region. Disabling browser gestures on the
  whole tab strip breaks horizontal scrolling on phones.
- Use a movement threshold, pointer capture, edge auto-scroll, Escape/cancel,
  lost-capture/disconnect cleanup and a captured tab-list identity. Cancel if the
  list changes or the dragged target disappears. Reveal the close control as
  well as the label after keyboard movement.

**Host integration lesson:** capture and restore source position (page, source
scroll X/Y, surrounding panel scroll and composer visibility) using the complete
source scope, not one global scrollTop. Do not remount the host panel on reorder.
The extracted tabs expose one host-owned slot; annotation position logic remains
in `SourceAnnotationPanel`.

## 3. Source copy, line selection and virtual notes

Original: `packages/source-annotations-ui/src/source-annotation-panel.ts`
(`onSourceCopy`, `captureSourcePosition`, `restoreSourcePosition`,
`renderVirtualAnnotation`), `e2e/annotations.e2e.ts`, `e2e/virtual-source.e2e.ts`,
`e2e/source-position.e2e.ts`, `e2e/source-line-height.e2e.ts`.

**Separate source-annotations migration, not duplicated here.**

- Source and notes are different documents. A virtual note appears **after the
  anchored end line**, but does not acquire a source line number or enter copied
  source. “After line N”, original target, current placement, moved/stale status
  and provenance must stay distinguishable.
- Source-copy derives text from source-line data and selection offsets, not the
  container's `innerText`. DOM includes gutters, note bodies, buttons and an inline
  composer. Multi-line partial selections preserve first/last offsets. Gutter
  selection copies the inclusive source range. Editable inputs/textareas retain
  their own normal copy behavior.
- Highlight spans must preserve text offsets. Unplaced/stale/other-path notes
  belong in an explicit elsewhere section, not attached to a convenient line.
- Selection, create drafts, edit drafts, list/mutation responses and restored
  positions are fenced by client identity, explicit owner scope, path, resolved
  ref and requested ref. Waiting for a render does not make an old restore safe;
  check scope/generation again after each await.
- Paging preserves absolute line identities. A restored page must be clamped to
  the current source, and composer visibility restored only if selection and
  write policy still permit it. Read-only/WORKTREE views do not gain write
  capabilities merely because an old composer was open.
- Code and gutter row line-height must agree, including narrow layouts, highlight
  output and empty lines; otherwise line-range selection visually drifts.

**Repository-ui implementation is intentionally simpler:** preview Copy uses the
captured displayed plaintext only, and reports truncated copies honestly. It has
no line/range annotation logic or virtual notes.

## 4. Async scope, stale actions and bounded search/preview

Original: `src/repository/file-search-dialog.ts`,
`src/workbench/file-surface-controller.ts`, `src/workbench/file-surface.ts`,
`src/workbench/file-surface-controller.test.ts`, `e2e/file-search.e2e.ts`,
`e2e/workbench-files.e2e.ts`.

**Implemented, with generic immutable repository scope instead of Pi sessions.**

- Fence all observable work by sequence + exact client + logical scope + path/ref
  or query + connection/open state. Abort is useful cleanup but insufficient:
  transports can ignore it or already have a response queued.
- Clear selectable old results at query/scope change, not only when the next
  request completes. An action fired before Lit's next update must still check
  the captured context against current properties. Request-only fences do not
  prevent stale option clicks or stale toolbar actions.
- Debounce and cap both input and output. The original search's 120ms debounce,
  128-code-unit input and 100-result display bound survive. `truncated` means
  more matching results were cut; `incomplete` means enumeration was incomplete.
  Do not use the former to conceal the latter, or say “not found” conclusively.
- Keep a response's pinned immutable identity. Never open a search result by
  re-resolving a moving branch label after the user chose it. The new client
  contract goes further: resolve the branch before binding the whole scope.
- A read publishes a new immutable snapshot; a late read cannot mutate a snapshot
  held by a view, replace a newer path, repopulate a closed surface or revive a
  disposed controller. Inactive completion stays cached in its own surface, not
  announced as the active file. Replacing the client clears the old cache.
- Refresh is an explicit read, not a side effect of selecting a tab. Ready-state
  scroll is saved before refresh; a loading render's scroll event must not replace
  it with zero. Binary, empty text, unavailable, loading and truncated are
  different facts. Byte size is not JavaScript string length.
- Clipboard completion is also asynchronous. Capture the source before copying,
  and never place old success/failure status on a newly selected document.

**Not copied:** Pi session selection, routes, workbench document orchestration,
vim-like application keybindings and source/conversation switching. The original
preview controller's async-highlighter fence is retained as a lesson below;
plaintext has no corresponding asynchronous markup stage.

## 5. Knowledge: canonical sources versus derived context

Original: `src/knowledge/knowledge-view.ts`, `shared/context-prompt.ts`,
`shared/context-prompt.test.ts`.

**Lessons only here; data/prompt construction stays headless.**

- Tracked project documents are canonical. Summaries/session outcomes are derived
  annotations with source transcript and changed-file provenance. Show that
  distinction, freshness and chronology; a summary card is not an authoritative
  rewrite of its source.
- Browsing/searching context must not automatically put it into a prompt. Prompt
  inclusion is an explicit per-source selection followed by an explicit draft
  action, distinct from sending a message.
- Select by stable source key, not row index or rendered label. Scope changes
  clear old selections. A source that became stale cannot remain silently
  included because its checkbox was previously checked.
- Display estimated tokens against a bounded budget and report exclusions/reasons.
  Refuse a misleading draft when selected sources are stale or cannot fit; do
  not silently drop or substitute selected evidence. Estimates are estimates,
  not model-provider accounting guarantees.
- A generated draft remains user-reviewable and preserves source attribution.
  No background “knowledge” scrape, implicit private-note disclosure or automatic
  prompt submission belongs in a generic library component.

## 6. Dialogs: exact origin and no late answers

Original: `src/extension-dialog.ts`,
`src/extensions/extension-dialog-controller.ts`,
`src/extensions/extension-dialog-controller.test.ts`, `e2e/extension-dialog.e2e.ts`.

**Lessons only for Pi interactive requests. File-picker native modal is implemented.**

- “Origin” includes the logical requester/owner, not just the currently visible
  session or a display label. Queue identity is the tuple **owner scope + request
  ID**, encoded unambiguously; an ID alone can collide across owners.
- An answer must carry the **captured request object** and be accepted only if it
  is still the exact active request, connected, unresolved and not already
  answered. A stale click/submit/timeout for request A cannot answer request B
  even if they render the same fields or share an ID in different scopes.
- Mark a request responded and remove it from the queue before awaiting network
  delivery. Duplicate submissions/resolutions must be idempotent; a send failure
  is reported without answering some later request. A backend-resolved request
  must never reappear through a late UI answer.
- Only supported interactive methods mount a modal. Notifications and optional
  fire-and-forget decorations are not dialogs; an unknown method must not create
  an invisible click-blocking layer or overwrite a draft.
- Focus/prefill changes scheduled after rendering must recheck the request object
  and answered flag. Clearly expose the true requester in UI without treating an
  origin label as authorization. If a host adds cross-window messaging, it must
  validate exact `event.origin`/source and use an exact target origin; no such
  bridge is implemented by repository-ui.
- New generic modals should use native `<dialog>.showModal()`, native cancellation
  and focus restoration. Do not transplant the old application's custom modal
  focus handling or layer manual traps over native dialog.

## 7. Long-thread reading versus following live output

Original: `src/agent/timeline/timeline-scroll-controller.ts`,
`src/agent/timeline/thread-minimap.ts`, `e2e/long-session.e2e.ts`,
`e2e/session-performance.e2e.ts`.

**Lessons only; no timeline/runtime/reducers copied.**

- Following is user intent, not `scrollTop = scrollHeight` on every render. Upward
  wheel, PageUp/Home/Shift+Space and upward touch movement pause follow. Newly
  arriving tokens must not pull someone away from what they are reading.
- Resume on an explicit follow action or a deliberate downward return near the
  bottom, not merely because layout shrinkage or a programmatic scroll happened
  to put the viewport near the end. The original outer near-bottom threshold
  was 48px; that is a tuning value, not a cross-component semantic constant.
- Nested tool/output panes have independent scroll keys and follow flags (the
  original nested threshold was 24px). Scrolling a nested stream must not pause
  or resume the outer thread unexpectedly. Inspect the composed event path.
- Coalesce measurement/scroll work with animation frames; use ResizeObserver to
  react to real content-size changes, not arbitrary polling. Disconnect observers
  and cancel scheduled frames. Reset follow state on owner changes, not every
  token.
- A minimap/progress affordance is a reading aid, not an alternative source of run
  truth. Keep current turn, viewport and user-requested follow consistent. Native
  selection, search and readable code must survive performance optimizations.

## 8. Optional syntax highlighting, never a readability dependency

Original: `src/syntax-highlight.ts`, `src/syntax-highlight-implementation.ts`,
`src/syntax-highlight.test.ts`, `src/design-system/chatworks.ts`, plus the
highlighter supersession test in `src/workbench/file-surface-controller.test.ts`.

**Lessons only; repository-ui renders literal plaintext.**

- Load grammar registries/regex engines lazily behind a tiny adapter; do not put
  them in every reader's initial module graph or make a new hard UI dependency.
  Unknown languages and failed highlighting fall back to escaped readable text.
- Highlighting has the same late-result fence as the source read. A highlight for
  old source A must never publish after the user opened source B, replaced the
  client, closed the surface or disposed/recreated the controller.
- Source text is untrusted; highlighter HTML is a distinct trusted boundary.
  Escape text, constrain class identifiers and accept HTML only from a
  deliberately configured trusted highlighter/sanitizer. A repository response
  must not become `unsafeHTML` merely because its field is called `html`.
- Emit semantic token parts/classes, not engine-owned inline theme colors. The
  host owns syntax contrast in both themes. Diff structural coloring and token
  coloring need to coexist; patch headers are not ordinary code lines.
- Preserve text and line boundaries. Styling must not alter copied source or
  offsets used by annotations. Failing syntax must not hide the document, strand
  a loading state or disable copy.

## 9. Document facts, action placement and theme contrast

Original: `src/workbench/document-header.ts`,
`src/workbench/document-header.test.ts`, `e2e/workbench-document-headers.e2e.ts`,
`src/design-system/presentation.ts`, `src/design-system/tokens.css`.

**Basic facts/contrast implemented; full shell/header system is lessons only.**

- Resource identity (path, scope/snapshot, read-only state) is distinct from
  selection facts (bytes, truncated state, selected range) and operation status
  (copy/loading/error). Do not make a snapshot look like a live editor buffer.
- Display facts come from one immutable view snapshot; dispatch captures the real
  source identity, not a label or whichever file is active after an await.
- Copy labels must say “displayed preview” when truncated; unavailable size stays
  unknown. A “refresh” action must not imply a save. Disabled actions correspond
  to real capability/state, not merely a visually muted button.
- Keep frequently used Back/Refresh/Copy actions visible; put optional controls
  in native disclosures when necessary. Narrow layouts wrap or scroll bounded
  regions without shrinking text/targets into unreadability or clipping the
  only close control. Use real buttons, focus outlines and descriptive names.
- Contrast belongs to text, focus, selection, disabled state, syntax and diff
  semantics together. Verify light/dark and wide/narrow, not just one polished
  desktop screenshot. Do not copy dark engine inline colors into a light host.
- The extraction uses system colors and native controls, with host styling parts,
  not a second Pi branding/token layer. That is a reusable baseline, not a claim
  of complete WCAG or screen-reader certification.

## Verification / preservation boundary

`tests/repository-ui/repository-ui.spec.ts` consumes emitted JS in a real Chromium
browser, not a DOM shim. It preserves the reorder helper's immutability/stale
request invariants and preview controller's snapshot, supersession, inactive
completion, disposal, failure and binary/empty/truncated/scroll invariants.
It adds actual component keyboard/pointer/focus, native dialog, search scope,
tree scope/action, display-budget and screenshot checks. Screenshots cover all
four actual elements in light/dark × wide/narrow; they are synthetic review
artifacts, not imported application screenshots or pixel baselines.

The original async-highlighter test is represented by plaintext/injection safety
and the explicit lesson above, **not** claimed as an implemented highlighter.
Original Pi E2Es named above are provenance and acceptance inspiration; they are
not runnable application compatibility tests for this extraction. Separate
source-annotations and Commits suites check their own public compiled exports.

Public export/side-effect metadata, root builds, strict declarations and packed
consumer graph/identity checks are integrated separately from these Chromium
tests. Other browser engines, assistive technology and real touch behavior remain
unverified. The native dialog uses autofocus and progressive scroll containment,
without a custom focus trap or body/root scroll-lock script; the existing
Chatworks browser-style foundation supplies the common baseline.
