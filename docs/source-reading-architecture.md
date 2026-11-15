# Source-reading architecture and consumption

## Ownership

Chatworks owns optional browser presentation and interaction lessons, not local
Git execution, private note storage, Go services or editor-native buffers.

```text
Chatworks /source-annotations --type contracts--> source-annotations/contracts
Chatworks /commits-reader -----contracts/state--> commits-core
Chatworks /repository-ui ------injected clients--> host adapter
Chatworks proto/* ------------compatibility----> git-chat-protocol
headless commits-adapters ---------------------> commits-core + protocol
headless source-annotations -------------------> repository-core
GitChat ---------------------------------------> independent Go implementation
```

No headless package depends on Chatworks or Lit. GitChat remains the wire-schema
and Go-service owner; descriptors are generated in the headless protocol leaf,
not defined by UI components. Compatibility reexports retain identical descriptor
objects rather than copies or wrappers.

The source-reading entries are **not in the default barrel**. Import them
explicitly. They are experimental optional features, not a new all-in-one
application or stable API promise. Existing chat/workbench compositions remain
available; the retired Pi shell, broker, terminal and sessions were not imported.

## Direct Node and RPC are complementary

A host may embed native Node packages when its runtime permits filesystem/Git
access, or use a scoped RPC client. Browser features accept host-injected
clients/providers. They do not select a server or read a repository themselves.

VS Code can use an appropriate Node extension host or RPC; web extensions and
Neovim need a service/CLI bridge. No editor plugin is delivered here. There is
no forced Go port of Node behavior and no mandatory GitChat backend.

GitChat currently has **no annotation RPC**. Private authored notes differ from
generated knowledge in ownership, authority and lifecycle. Do not upload,
synchronize or reinterpret notes merely because a GitChat connection is present.
A shared interface cannot manufacture missing functionality or backend parity.

## Consumer artifacts and peer requirements

The headless packages are private/unpublished. Do not interpret README install
examples for an existing registry release as publication of this checkout.

- Existing proto/transport/default-barrel use requires
  `@jpahd/git-chat-protocol@0.0.0`, Protobuf and the existing Connect peers.
- `/commits-reader` additionally requires `@jpahd/commits-core@0.0.0`.
- `/source-annotations` references
  `@jpahd/source-annotations@0.1.0/contracts` in declarations only. Browser bundles
  must not include its Node service or repository-core runtime.
- `/repository-ui` adds no headless dependency: it uses structural UI client
  interfaces and the existing Chatworks/Lit browser foundation.

Supply private npm tarballs together with their declared dependencies for external
consumers. Source-annotations requires the matching repository-core artifact for
Node use; its browser contract import remains type-only. Never replace declared
runtime peers with dev-only dependencies or a sibling source alias. Headless peers
have optional-install metadata to support unrelated entries; an entry that imports
a peer still requires it at runtime or for declarations.

Development uses explicitly supplied tarballs, not cross-repository filesystem
dependencies or layout-specific overrides. Install pinned third-party tooling,
then run `npm run dev:artifacts -- /absolute/path/to/repokit-tarballs`. The stager
validates and extracts the matching six-package bundle without source access,
lifecycle scripts, network requests or manifest/lockfile changes. See
[development artifact setup](development-artifacts.md).

The independent packed-consumer command also requires an explicit artifact path:
`npm run test:package -- /absolute/path/to/repokit-tarballs`. There is no default
checkout or environment fallback. Its helper is maintained here, not imported from
another repository. It rebuilds/packs Chatworks and extracts the six supplied
headless tarballs. Installed third-party
dependencies (including Lit transitive declarations) are fixtures, not a fresh
registry/offline-install claim. It checks strict public types, registration under
a DOM shim, canonical descriptor identity, Lit deduplication and Vite browser
graphs. DOM-shim success is not real-browser behavior proof.

## Identity and authority

Hosts bind repository/auth scope, immutable refs, exact paths, author identity,
navigation and mutation authorization. Mutable worktree previews are not immutable
annotation targets. Components must reject stale responses and stale controls
before sending requests, not only ignore their completion.

Draft/selection/cache identity includes the appropriate client and repository/
snapshot scope. Replacing credentials/routing behind a supposedly stable client
violates that contract. Provenance labels and semantic events grant no authority.
Backend revision checks and authorization remain necessary even with read-only
or correctly fenced UI.

## Verification

`npm run check`, existing unit tests, `npm run test:tooling`,
`npm run test:package -- /absolute/path/to/repokit-tarballs`, and the three
feature browser commands are separate checks. Synthetic examples consume public
compiled exports. Review screenshots in both color schemes and narrow/wide
viewports; do not relax tests or conflate a source move with acceptance.

See [source annotations](source-annotations.md),
[Commits reader](commits-reader.md), [repository primitives](repository-ui.md)
and [preserved interaction lessons](pi-webui-interaction-lessons.md). The
[recorded verification](source-reading-verification.md) states exact checked scope
and remaining limits. Historical
application evidence stays at the headless repository tag
`archive/pi-webui-application`, not a new legacy directory. Private storage was
not read, migrated or synchronized by this consolidation.
