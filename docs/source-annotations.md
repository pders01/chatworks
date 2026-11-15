# Source annotations

Optional, MIT-licensed Chatworks browser UI: `@jpahd/chatworks/source-annotations`.
This ESM-only Lit 3 component has **no host, RPC, session-store, Node-runtime,
application design-system, network, or storage dependency**. Its only annotation
import is the browser-safe `@jpahd/source-annotations/contracts` **type** entry.
Lit is a peer; it is not bundled. The host can use direct Node libraries behind an
injected bridge, a separate GitChat RPC backend, or any other implementation of
`AnnotationClient`. No backend is selected or required by this UI.

## Build and consume

After [staging the explicit package artifacts](development-artifacts.md):

```sh
npm run build
npm run test:source-annotations
npm run test:package -- /absolute/path/to/repokit-tarballs
```

The optional isolated component compile remains available with
`tsc -p tests/source-annotations/tsconfig.build.json`; browser fixtures use the
normal public package export, not that separate output.

The optional package entry resolves to `dist/source-annotations/index.js`, with
`.d.ts`, declaration maps, and source maps. Importing it defines the existing
`source-annotation-panel` tag and exports `SourceAnnotationPanel`, plus the
`AnnotationSourcePosition` and `SourceAnnotationsChangedDetail` types.

```ts
import { SourceAnnotationPanel } from '@jpahd/chatworks/source-annotations';
import type { AnnotationClient } from '@jpahd/source-annotations/contracts';

const client: AnnotationClient = /* stable host-bound client */;
const panel = new SourceAnnotationPanel();
Object.assign(panel, {
  client,
  scopeKey: 'opaque-authority-and-workspace-id',
  path: 'src/example.ts',
  ref: immutableCommit,
  requestedRef: 'main',
  content: sourceText,
  maxLine: sourceLineCount,
  sourceView: true,
  allowCreate: true,
  active: true,
});
document.body.append(panel);
```

The host owns repository/account/session selection, authentication, author
attribution, filesystem access, snapshot resolution, anchor matching, and persistence.
The UI does not infer any of these from ambient state. Never put credentials or
private user data in `scopeKey`; it is included in semantic events and position state.
The host must enforce read/write authority in its client too: `readOnly` is a UI
policy, not a security boundary.

## Properties (properties down)

| Property           | Default     | Contract                                                                                                                                                                          |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`           | `undefined` | Injected `AnnotationClient` with `list`, `create`, `update`, `delete`. Keep its identity stable across renders/remounts. Replace it when authority/backend changes.               |
| `scopeKey`         | `""`        | **Required** opaque host authority/workspace/session scope; `scope-key` attribute also supported. No reads or mutations run without both client and nonempty scope.               |
| `path`             | `""`        | Exact repository-relative source identity.                                                                                                                                        |
| `hidePath`         | `false`     | Suppress the path heading when the containing reader already names the file. Snapshot provenance and note controls remain available.                                              |
| `ref`              | `"HEAD"`    | Immutable SHA for the displayed snapshot; a symbolic ref may be resolved by `list`. `WORKTREE` allows reading/managing existing notes but never original-anchor creation.         |
| `requestedRef`     | `""`        | Host's original symbolic ref, retained as provenance and a scope dimension.                                                                                                       |
| `content`          | `""`        | Complete immutable preview source, not a diff or truncated preview. CRLF is normalized for line selection/copy; original line content, indentation, and blank lines are retained. |
| `maxLine`          | `undefined` | Optional inclusive line bound; host must disable creation on incomplete previews.                                                                                                 |
| `highlightedLines` | `[]`        | **Trusted-only** escaped highlighter fragments, one per source line. Default plain-text rendering is safe for arbitrary source text. See trust boundary below.                    |
| `active`           | `false`     | Reflected boolean. Inactive panels render no controls and fence async completions.                                                                                                |
| `readOnly`         | `false`     | Disable create/save/update/resolve/delete. Reading and draft text remain available.                                                                                               |
| `allowCreate`      | `false`     | Explicit creation capability, separate from editing existing notes.                                                                                                               |
| `sourceView`       | `false`     | Source-first view with numbered source and separate virtual note rows. `false` preserves the extracted notes-only range editor.                                                   |
| `showAnnotations`  | `true`      | In source view, hide notes/controls and avoid annotation reads when false. Source selection/copy remains usable.                                                                  |

Object inputs are JavaScript properties, not serialized attributes. In Lit use
`.client=${client}`, `.highlightedLines=${lines}`, etc.

## Events (events up)

`source-annotations-changed` is dispatched **only after an accepted mutation**,
bubbles and crosses shadow boundaries. Detail type `SourceAnnotationsChangedDetail`:

```ts
{ scopeKey: string, path: string, ref: string }
```

No event is emitted for a property update, failed mutation, late response, or a
completion after disconnect. It is a semantic invalidation signal, not annotation
HTML or an authorization token. This component never emits host-specific events.

## Selection, drafts, and async safety

- Click a line number; Shift-click or Shift+Up/Down extends an inclusive range.
  Escape cancels the composer or clears selection. Native source text selection is
  supported; source copy excludes gutter numbers and virtual annotation content.
- Source uses bounded **500-line pages**, not approximate virtual row heights. Notes
  are separate DOM rows after their inclusive end line, never source text. Notes
  with stale/unplaced, wrong-ref, wrong-path, or out-of-bounds placement stay in a
  separate disclosure; a positional match is not a semantic validity guarantee.
- Create requires a complete SHA resolved by the client or supplied by the host.
  Every update/delete includes `expectedRevision`. Errors preserve drafts; refresh
  can obtain the current revision before retrying. No silent conflict overwrite.
- Create/edit/selection drafts are held in module memory across element remounts,
  keyed by **client identity + explicit scopeKey + path + ref + requestedRef**.
  They are not persisted to browser storage. A new client identity gets a distinct
  draft namespace, even with the same scope key. Hosts must not mutate a client's
  bound authority behind an unchanged identity/scope.
- `captureSourcePosition(): AnnotationSourcePosition` returns opaque scope-fenced
  page, panel/source scroll offsets, and composer state. After mounting an active
  replacement with the **same client object and source properties**, await
  `restoreSourcePosition(position)`. Mismatched positions are ignored; page bounds
  are clamped. Do not interpret or manufacture its `scope` field.
- Rendered controls validate their captured client/scope before sending a mutation.
  A synchronous property change cannot route a stale note action through a new
  client. Affected draft fields remain disabled while a mutation is pending;
  programmatic stale inputs are also ignored. Current wrong-SHA responses show an
  explicit mismatch error instead of a successful-looking empty list.
- Disconnect, inactive state, scope/client changes, newer reads and mutations fence
  obsolete completions. The host remains responsible for cancelling its transport
  if desired; fencing is not transport cancellation.

## Styling

The component has its own shadow DOM and restrained light/dark defaults. Set
`color-scheme: light`, `dark`, or `light dark` on an ancestor to select the defaults;
this does not change the host application's shell. Modern browsers supporting
`light-dark()` and container queries are required for the default presentation.

Public CSS custom properties (set on the element or inherited):

| Token                 | Default (light / dark where applicable)    |
| --------------------- | ------------------------------------------ |
| `--sa-background`     | `#fff` / `#141414`                         |
| `--sa-surface`        | `#fafafa` / `#191919`                      |
| `--sa-muted-surface`  | `#f5f5f5` / `#202020`                      |
| `--sa-border`         | `#e8e8e8` / `#303030`                      |
| `--sa-text`           | `#202020` / `#ededed`                      |
| `--sa-secondary`      | `#686868` / `#a4a4a4`                      |
| `--sa-accent`         | `#245edb` / `#91b5ff`                      |
| `--sa-on-accent`      | `#fff` / `#101d38`                         |
| `--sa-danger`         | `#b62b32` / `#ff9a9f`                      |
| `--sa-warning`        | `#856019` / `#e1bd77`                      |
| `--sa-font`           | System sans-serif stack                    |
| `--sa-mono`           | System monospace stack                     |
| `--sa-code-size`      | `.8125rem`                                 |
| `--sa-line-height`    | `1.5rem` (same for blank/code/gutter rows) |
| `--sa-syntax-keyword` | Accent                                     |
| `--sa-syntax-string`  | `#357149` / `#97cba6`                      |
| `--sa-syntax-number`  | Warning                                    |

No arbitrary styles/template hook is required. Internal classes and `--_sa-*`
variables are implementation details, not styling API. The standalone default is
24px source rows at a 16px root size; owners can set `--sa-line-height` to change
code, blank-line and gutter metrics together.

### Highlighting trust boundary

`highlightedLines` deliberately retains the existing **unsafeHTML trusted-only
sink**. It is not a sanitizer, and must contain only trusted escaped highlighter
output whose text exactly matches the corresponding source line. Never pass user
annotation bodies, server-provided arbitrary HTML, raw source, or arbitrary host
markup. Leave the array empty for safe plain text. Note bodies, provenance, error
messages and source fallback are always rendered as text. Built-in `.syntax-*`
classes use the documented syntax tokens; inline highlighter colors must be chosen
by the host for both themes.

## Package integration

1. The optional export is deliberately not imported from the default barrel:
   ```json
   "./source-annotations": {
     "types": "./dist/source-annotations/index.d.ts",
     "import": "./dist/source-annotations/index.js"
   }
   ```
2. Preserve registration side effects with `./src/source-annotations/*.ts` and
   `./dist/source-annotations/*.js` entries in `sideEffects`.
3. The headless `@jpahd/source-annotations` package is an optional peer at `0.1.0`,
   staged from an explicit artifact bundle in development for typechecking. Its `/contracts` entry must
   resolve for declaration consumers. There is no annotation runtime import or
   Node service entry to bundle. Lit 3 remains a peer.
4. Root build/check and real packed-consumer checks include this directory. The
   isolated fixture compile is not a replacement for artifact verification.
5. Demo and regression fixtures consume `@jpahd/chatworks/source-annotations`
   through the actual package export. Build Chatworks before running them; never
   replace it with a source alias.

## Verification and visual review

See [the synthetic example](../examples/source-annotations/README.md).

```sh
npm run build && \
node_modules/.bin/tsc -p tests/source-annotations/tsconfig.json && \
node_modules/.bin/playwright test -c tests/source-annotations/playwright.config.ts
```

The runner uses existing `playwright/test` and Vite executables, a single worker,
loopback **5198**, strict port ownership, `reuseExistingServer: false`, and
`envDir: false`. It does not launch any host or backend. Do not run another server
on that port concurrently. Results are under `tests/source-annotations/test-results/`.

Coverage is carried forward rather than discarded:

- `virtual-source.e2e.ts`: 14 cases × wide/narrow, with direct injected
  `AnnotationClient` promises instead of a retired Pi adapter/RPC socket.
- `source-position.e2e.ts`: 11 cases × wide/narrow, including remount, all five
  scope dimensions, dual scroll surfaces, page bounds and both restore races.
- `source-line-height.e2e.ts`: 2 cases × wide/narrow; standalone 24px metrics
  replace the retired host's 20px/22px overrides. This preserves all **54**
  self-mounted compatibility cases and their useful behavioral assertions.
- `panel.spec.ts`: 9 standalone behavior cases and 28 screenshot states
  (light/dark × wide/narrow × populated/empty/edit/compose/error/empty-file/readonly).
- `annotations.spec.ts`: 11 cases × wide/narrow covering notes-only category,
  preview, provenance, creation, refresh-before-mutation acceptance, read-only,
  draft return, mutation retry, disconnect, deactivation, resolve/reopen/delete,
  WORKTREE and safe plain-text rendering.

Six curated migration references are retained under
`tests/source-annotations/screenshots/`; complete runs regenerate ignored captures.
Screenshots are review artifacts, not visual-regression goldens. The migration
review opened these files under `tests/source-annotations/test-results/`:

```text
panel-review-light-populated-wide-wide/light-populated-wide.png
panel-review-dark-populated-narrow-wide/dark-populated-narrow.png
panel-review-dark-edit-wide-wide/dark-edit-wide.png
panel-review-light-compose-narrow-wide/light-compose-narrow.png
panel-review-light-readonly-wide-wide/light-readonly-wide.png
panel-review-dark-readonly-narrow-wide/dark-readonly-narrow.png
panel-review-dark-error-wide-wide/dark-error-wide.png
panel-review-light-error-narrow-wide/light-error-narrow.png
panel-review-light-empty-file-wide-wide/light-empty-file-wide.png
panel-review-dark-empty-file-narrow-wide/dark-empty-file-narrow.png
```

The existing standalone look is retained. Source overflow is intentionally inside
its own scroll surface; notes and form controls wrap without page overflow. Read-only
policy now has an explicit visible label in both source and notes-only views.

### Verification limits

The maintained suite consumes the public compiled export and includes the
preserved source/annotation cases plus mutation-boundary regressions. Packed
checks independently cover declarations, registration and browser graph boundaries.
Lit development builds still report an inherited update-after-update warning on
async initial load; it is a known efficiency limitation, not a test failure.

Repository count badges, branch/tree loading, renamed comparison sides, blame,
file tabs and real backend persistence are host integration concerns from the old
`annotations.e2e.ts`, not implemented by this component. Useful self-mounted
behavior was migrated; the retired application remains in Git history. Firefox/WebKit, real native clipboard permissions,
assistive-technology/manual touch testing, packed publication and GitChat RPC or
direct Node host integration remain separate verification gates.
