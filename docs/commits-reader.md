# Commits reader

`@jpahd/chatworks/commits-reader` registers `<portable-commits-reader>` and exports
`PortableCommitsReader`. This experimental entry is absent from the default
barrel and requires `@jpahd/commits-core` for shared contracts and runtime state.

The component presents history, commit details and bounded diffs. An injected
`CommitsProvider` owns all I/O; importing the UI does not read a repository.

```ts
import "@jpahd/chatworks/commits-reader";
import type { CommitsProvider, CommitsIntentDetail } from "@jpahd/commits-core/contracts";

function mountReader(provider: CommitsProvider, target: HTMLElement) {
  const reader = document.createElement("portable-commits-reader");
  reader.provider = provider;
  reader.instanceKey = "history-pane";
  reader.exposed = true;
  reader.addEventListener("commits-intent", (event) => {
    const { instanceKey, scopeKey, intent } = (event as CustomEvent<CommitsIntentDetail>).detail;
    if (instanceKey !== reader.instanceKey || scopeKey !== reader.provider?.scope.key) return;
    // Accept navigation explicitly; hosts can validate/persist it before echoing.
    if (intent.kind === "location") reader.location = intent.location;
  });
  target.append(reader);
  return reader;
}
```

## Provider and host contracts

The public `CommitsProvider` in `@jpahd/commits-core/contracts` has a stable
`ReadingScope` and six reads: `describe`, `listRefs`, `resolve`, `list`, `commit`
and `diff`. Each receives an `AbortSignal` and returns a `ReadResult` with the
matching scope key. Hosts resolve symbolic refs to immutable full commit SHAs;
shortened display labels are not identities. Report refused/unavailable reads
with the portable `RepositoryReadError` categories, not arbitrary backend text.

Hosts can implement `CommitsProvider` around native reads from
`@jpahd/repository-core`, or use the read-only provider exported by
`@jpahd/commits-adapters/git-chat`. There is no prebuilt native Commits provider
in the adapter package. Browser hosts must bridge Node reads through a trusted
transport, not bundle filesystem/Git services. git-chat support is deliberately
conservative: first-parent diffs, paging, ancestry and completeness may differ
by backend. A shared provider interface does not imply feature parity.

Inputs are JavaScript properties:

| Property      | Contract                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| `provider`    | Stable host-bound provider; replace it when authority/scope changes          |
| `location`    | Host-owned `CommitsLocation`: ref, optional anchor/path/commit               |
| `instanceKey` | Nonempty host identity for this reader instance                              |
| `exposed`     | Defaults false; controls visibility and whether intents may leave the reader |
| `actions`     | Optional `"explain"` / `"return"` affordances, not execution authority       |

`commits-intent` bubbles and crosses shadow boundaries. Its `CommitsIntentDetail`
contains `{ instanceKey, scopeKey, intent }`. The host validates provenance and
echoes accepted location changes into `location`; the reader does not own routing
or location persistence. Scope keys are opaque, nonsecret authority identifiers,
not URL identities. Explanation/return intents are requests, not actions
executed by the component. Intents require an exposed, connected reader with a
nonempty instance key and a current provider binding.

Superseded reads are fenced; disconnect detaches reads. `exposed=false` is not a
read-cancellation switch. Shared selection/read logic belongs to
`@jpahd/commits-core/state`, not private component fields.

## Evidence and display limits

- Filtering searches **loaded commits only**. Graph edges describe visible rows;
  missing parents are not roots. Full history cannot be inferred from the graph.
- Diffs compare the first parent or the empty tree for a root commit. Backend
  summary statistics do not establish patch completeness.
- Backend partial/unknown completeness, reader display clipping, absent patch
  text and structured-render refusal are distinct states. A missing patch is
  not an empty change unless the backend explicitly reports one.
- Patch bytes, rendered lines and word-pair work are bounded by commits-core's
  `READER_LIMITS`. Clipped prefix/ending excerpts are labeled as such; omitted
  middle text is not certified complete. Raw text remains available when
  structured rendering is refused.

Source text is rendered literally. Raw patch/tail panes are keyboard-focusable
named documents. The embedded commit title is an `h2`; fit the reader into the
host's heading hierarchy and provide height for its panes.

## Presentation and examples

The `--reader-*` custom properties, including `--reader-surface`, support host
theming. See the light/dark styles in
[the standalone example](https://github.com/pders01/chatworks/tree/main/examples/commits-reader).
The example and Storybook use synthetic providers, not a bundled backend.
Artifact setup and verification commands are in
[contributing](https://github.com/pders01/chatworks/blob/main/CONTRIBUTING.md).
