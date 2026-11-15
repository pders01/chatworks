# Commits reader

`@jpahd/chatworks/commits-reader` is the browser-only entry for
`PortableCommitsReader`. Importing it registers the original
`<portable-commits-reader>` tag. Do not load the retired standalone reader package
in the same document: both would register the same tag.

The entry uses internal relative imports for Chatworks graph/diff rendering.
Contracts, state and bounded patch helpers are imported from the compiled public
`@jpahd/commits-core/contracts` and `/state` entries. Headless Node consumers should
import core directly; they do not need Chatworks, Lit, a DOM shim or these stories.
GitChat remains a separate optional backend. Browser UI has no adapter dependency.

## Host-owned data and navigation

```ts
import { PortableCommitsReader } from "@jpahd/chatworks/commits-reader";
import type { CommitsIntentDetail } from "@jpahd/commits-core/contracts";

const reader = document.createElement("portable-commits-reader");
reader.provider = provider; // explicit scoped read capability supplied by host
reader.location = { ref: "refs/heads/main" };
reader.instanceKey = "history-pane-1";
reader.actions = ["return", "explain"]; // opt-in host intents, not execution
reader.exposed = true;
reader.addEventListener("commits-intent", (event) => {
  const { instanceKey, scopeKey, intent } = (event as CustomEvent<CommitsIntentDetail>).detail;
  // The real host must validate current pane/scope before acting on any intent.
  if (instanceKey !== reader.instanceKey || scopeKey !== reader.provider?.scope.key) return;
  if (intent.kind === "location") {
    // Persist/route in the host if desired, then echo the accepted location.
    reader.location = intent.location;
  }
});
container.append(reader);
void PortableCommitsReader; // exported class available for typing/subclassing
```

Give the container a definite height; the component fills it and owns independent
history/detail scroll regions. Set `.exposed` to false when retained but hidden:
the reader becomes hidden/inert and does not record hidden zero-layout scroll
positions or emit host intents. Removing the element aborts reads; reconnecting
resumes with the same headless pin/lifecycle rules.

Properties are passed as JavaScript values, not serialized attributes:

| Property      | Default | Ownership                                                                                                           |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `provider`    | absent  | Host-selected, explicit repository/worktree scope and read implementation                                           |
| `location`    | absent  | Host-owned ref, optional immutable anchor, exact path and independent selected commit; omitted uses provider policy |
| `instanceKey` | `''`    | Host pane/instance identity; nonempty required for intent delivery                                                  |
| `actions`     | `[]`    | Optional `return` / `explain` affordances                                                                           |
| `exposed`     | `false` | Host visibility/intent eligibility                                                                                  |

`commits-intent` is a bubbling, composed `CustomEvent<CommitsIntentDetail>` with
`instanceKey`, `scopeKey`, and `intent`. `location` asks the host to accept a route
change; the reader does not silently change the supplied location. `refresh`
notifies the host while explicitly refreshing the local snapshot. `explain`
contains only commit ID/subject and requests draft preparation; no agent runs.
`return` requests host navigation; it does not implement routing or focus return.

Filter and split/unified choice are instance-local UI state. Reads, cancellation,
validation, budgets, pin retention and safe failures remain in core. Backend
completeness, explicit empty diffs and absent text are not conflated; clipped raw
patch endings remain separate literal evidence. Large paired-word work falls back
to bounded plain text instead of unbounded structured rendering.

## Presentation and accessibility

The existing `--reader-*` theme variables remain supported: `text`, `surface`,
`control`, `border`, `muted`, `selected`, `focus`, `font`, `mono`, `success`,
`danger`, `add`, `del`, and optional syntax colors. Defaults remain usable without
host styles. The component styles Chatworks diff parts internally.

Native controls, explicit same-shadow-tree `for`/`id` form labels, visible focus,
and list semantics are preserved. `role="list"` restores ordered-history list
semantics lost by Safari when marker styling is suppressed. IDs are local to each
reader's shadow tree and do not collide across instances. This is not a claim of
complete screen-reader/device certification.

## Synthetic states and browser checks

`stories/commits-reader.stories.ts` covers unbound, loading, empty, safe read
failure, incompatible connection, loaded navigation/filtering, selected metadata,
split layout, partial/unknown evidence, clipped display, structured-work refusal
and detail failure. All data come from `stories/fixtures/commits-reader.ts`; there is
no backend, authentication or live annotation access. The loading fixture holds a
read until cancellation and intentionally remains subject to the normal 10-second
reader deadline, rather than weakening production limits. Storybook uses the
byte-clipping fixture with fewer DOM rows for its full axe audit; the public
browser example separately exercises the 4,000-line clipping boundary. Neither
fixture raises production bounds or disables accessibility rules.

After [staging the explicit headless artifacts](development-artifacts.md):

```sh
# Chatworks
npm run check
npm run build
npm run test:commits-reader
npm run test:package -- /absolute/path/to/repokit-tarballs
npm run test:storybook -- --project=storybook-desktop-light stories/commits-reader.stories.ts
# Or inspect interactively:
npm run storybook

# From the headless monorepo
npm --prefix packages/commits-core test
npm --prefix packages/commits-adapters test
npm --prefix packages/commits-core run check:package
npm --prefix packages/commits-adapters run check:package
```

The standalone example at `examples/commits-reader/` and its Chromium tests use
`@jpahd/chatworks/commits-reader`, not source aliases. They cover twelve fixture
states in light/dark and wide/narrow layouts, computed theme colors, literal
source escaping, navigation/filtering and split diffs. Screenshots are review
artifacts, not pixel baselines. Headless Node suites separately cover races,
cancellation, immutable pinning and bounds; packed checks verify real artifacts.
Four curated migration references remain in `tests/commits-reader/screenshots/`;
complete browser runs regenerate ignored captures.

## Import migration and packaging

- Component: `@jpahd/chatworks/commits-reader`; retain
  `portable-commits-reader` markup and `commits-intent` handling.
- Contracts: `@jpahd/commits-core/contracts`; state: `@jpahd/commits-core/state`.
- Provider implementations: `@jpahd/commits-adapters`, supplied by the host.
- The root manifest exposes the optional compiled subpath, marks its modules as
  registration side effects, and declares the core as an optional peer. It is
  not imported by the default barrel.
- Stage explicitly supplied tarballs before building Chatworks; restage after
  a dependency reinstall or new bundle. No source checkout location is assumed.
  Supply private packed artifacts until an explicit release decision; see
  [artifact setup](development-artifacts.md).

The former standalone UI package and Pi application are historical, not parallel
maintained implementations. This is an explicit import migration for experimental
private packages, not a stable-API or backend-parity promise.
