# Source-reading migration verification

Recorded acceptance for the headless/Chatworks consolidation, not a claim about
all historical application gates or future releases. Our code is MIT; the new
headless peers remain private/unpublished. GitChat was not modified and no live
annotation store, credentials or application data were read or migrated.

## Independently rerun gates

Environment: macOS, Node 22.23.4, Bun 1.4.4 for the existing unit harness,
TypeScript 5.9.3 and Playwright 1.62.1/Chromium.

| Gate                                                        | Recorded result                                                                                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run check                                               | Passed, including source and Storybook types                                                                                                          |
| npm run lint                                                | Passed: zero warnings/errors                                                                                                                          |
| npm test                                                    | 174 existing unit tests passed                                                                                                                        |
| npm run test:package -- /absolute/path/to/repokit-tarballs  | Passed: actual maintained-package tarballs, strict declarations, shared Lit identity, canonical wire reexports, registration and browser graph checks |
| npm run test:source-annotations                             | 195 passed in wide/narrow Chromium, including 82 new mutation/draft/identity boundary cases                                                           |
| npm run test:commits-reader                                 | 48 passed: twelve states, both themes, wide/narrow, computed colors, literal content, navigation/filtering and split diffs                            |
| npm run test:repository-ui                                  | 27 passed: keyboard/pointer/focus, async identity, preview/cache/copy facts, picker/tree budgets and screenshots                                      |
| npm run test:storybook -- stories/commits-reader.stories.ts | 36 passed across the existing three Chromium projects, with axe rules enabled                                                                         |

The Storybook result is the focused Commits feature matrix, not a new run of all
existing Chatworks stories. The packed registration check uses a DOM shim and is
not browser-behavior proof. Browser fixtures separately use actual public compiled
exports, never sibling source aliases or a substitute feature build.

No screenshot tolerance, production bound, refusal condition or accessibility
rule was relaxed. Storybook uses a byte-clipped fixture with fewer DOM rows for
axe; the public browser example independently retains the 4,000-line fixture.

## Artifact-only development verification

The dependency workflow was independently reverified after removing all sibling
checkout assumptions:

- 69 synthetic Node tooling regressions passed: tar/identity/closure/metadata
  validation, no-source CLI behavior, real-directory staging, preflight refusals,
  byte-preserved manifests/locks, ordinary-error rollback and retained recovery
  backups.
- Types, lint, 174 existing unit tests, all 270 public-entry Chromium cases and the
  explicit-artifact packed consumer passed with real extracted headless packages.
- A relocated Chatworks fixture with no sibling source tree passed staging, full
  types and packed consumption from an explicitly selected six-tarball bundle.
  Only third-party installed fixtures were linked; package and lock bytes stayed
  unchanged. This was not a fresh third-party dependency install.
- Clean manifest/frozen-lock resolution passed offline without private packages
  or a source checkout. This was lockfile-only resolution, not an offline reinstall.
- No retained third-party resolution was upgraded. Private source locators and
  obsolete private-package development subtrees were removed from the lock.
- Packed Chatworks uses an owned copy of the public packaging surface with
  lifecycle scripts omitted as defense in depth. Dependency metadata and compiled
  exports are checked, but this does not certify the publication pipeline.

The 36-case Storybook/axe result above is the initial migration's focused matrix;
it was not rerun for this tooling-only correction. No component implementation or
fixture behavior was changed. See [artifact setup](development-artifacts.md).

## Preserved and strengthened behavior

- Source selection/copy, paging, exact line metrics, virtual notes, provenance,
  read-only states, remount/position restoration and scope/client-isolated drafts.
- Rendered mutation controls validate captured authority before dispatch, not only
  after completion. Pending draft fields are locked and stale input events cannot
  corrupt another scope. Wrong immutable snapshots surface an explicit error.
- Commits immutable pins, honest partial/unknown/clipped evidence, independent
  reader state, native labels/list semantics, sufficient default muted contrast
  and keyboard-accessible raw patch scrolling.
- File tabs and reorder/focus handoff; bounded async picker; scoped plaintext
  preview/cache; lazy disclosure navigation with aggregate row/depth limits.
- Legacy /proto exports forward canonical protocol objects instead of duplicating
  generated schemas. Browser graphs exclude Node annotation/repository services.

## Visual evidence

Representative final captures were opened and reviewed for every migrated/created
component in light/dark and wide/narrow layouts, including annotation edit,
creation, error and read-only states. The generic primitives use the existing
Chatworks browser foundation with restrained controls/surfaces, not a Pi skin or
another design system.

Curated migration references are retained in:

- tests/source-annotations/screenshots/: six source/note states.
- tests/commits-reader/screenshots/: selected light/dark, narrow partial and empty
  binding states.
- tests/repository-ui/screenshots/: all four components × light/dark × wide/narrow.

These are synthetic review references, **not pixel-baseline assertions**. Full
regenerable captures remain ignored test-results artifacts. Curated references
should only be refreshed after actual visual review.

## Remaining limits

- Annotation initial loads retain the inherited Lit development-mode
  update-after-update efficiency warning; the suites still pass.
- No Firefox/WebKit, assistive-technology, physical touch/OS clipboard permission,
  cross-platform or full application release certification is implied.
- No editor plugin, standalone persistent application, private-note upload/sync,
  annotation RPC or full Node/GitChat backend parity was implemented.
- Structural client contracts and UI read-only state do not replace backend
  authorization, immutable-source validation or optimistic revisions.
- APIs are experimental. Publication, dependency/version release policy and any
  data/storage migration need separate explicit approval.
