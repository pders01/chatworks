# Development with unpublished package artifacts

Chatworks does not assume a sibling checkout, directory layout or source location.
Its peer specifications are ordinary package versions. The new repokit packages
are still private/unpublished: do not expect a registry install to supply them.

## Prepare or obtain artifacts

Obtain all six matching MIT npm tarballs from the same repokit build. They may
come from any checkout or an explicitly supplied artifact bundle. Chatworks never
opens that source checkout or imports its development scripts.

To produce a bundle yourself, run these commands **inside the repokit checkout you
choose**, not from a hardcoded path in Chatworks:

```sh
ARTIFACTS=/absolute/path/to/repokit-tarballs
npm ci
npm run build
mkdir -p "$ARTIFACTS"
npm pack --workspaces --ignore-scripts --pack-destination "$ARTIFACTS"
```

Use a clean artifact directory containing one tarball for each of:

| Package                   | Current version |
| ------------------------- | --------------- |
| @jpahd/repository-core    | 0.0.0           |
| @jpahd/source-annotations | 0.1.0           |
| @jpahd/context-records    | 0.0.0           |
| @jpahd/commits-core       | 0.0.0           |
| @jpahd/commits-adapters   | 0.0.0           |
| @jpahd/git-chat-protocol  | 0.0.0           |

No package is published by these commands. Versions are experimental; matching
version strings alone do not establish that independently produced bundles are
from the same build.

## Set up Chatworks

From any Chatworks checkout:

```sh
ARTIFACTS=/absolute/path/to/repokit-tarballs
bun install --frozen-lockfile --ignore-scripts --no-env-file
npm run dev:artifacts -- "$ARTIFACTS"
npm run check
npm run build
npm run test:tooling
npm run test:package -- "$ARTIFACTS"
```

The lockfile pins third-party tooling only. Private peers have normal version
constraints and optional-install metadata: this permits installing Chatworks for
entries that do not use those peers, without trying to resolve unpublished
packages. It does **not** make them optional for an entry that imports them:

- Default/proto/transport entry use requires git-chat-protocol.
- Commits reader requires commits-core at runtime.
- Source annotation declarations require source-annotations/contracts for types.
- Repository UI has no headless runtime dependency.

The full development build and acceptance suite cover all entries, so they require
the complete artifact bundle. Repository-core and the other headless runtime
packages are not added to browser bundles just because the development tool stages
them locally.

The staging command validates the entire bundle before replacing installed
packages. It checks identities/versions, maintained dependency closure, MIT
metadata, portable dependency specifications, compiled exports and bounded safe
tar members. It creates real package directories under node_modules, never source
aliases or maintained-package links. It does not access the network, execute
lifecycle scripts, change manifests/lockfiles, create CLI shims or install global
packages. Third-party dependencies must already be installed.

Only the six named generated dependency directories are replaced. Linked package
or namespace targets are refused. An exclusive local lock rejects concurrent
staging; ordinary replacement errors trigger rollback. This is trusted local
checkout tooling, not a sandbox or crash-safe transaction. If a killed process
leaves node_modules/.chatworks-artifacts.lock, inspect/recover its temporary
staging directory before removing that local lock manually.

After any dependency reinstall or rebuilt bundle, stage the artifacts again and
rebuild Chatworks. No artifact path, tarball or installation state belongs in Git.

## Independent packed consumer

`npm run test:package -- "$ARTIFACTS"` requires the explicit artifact directory;
there is no fallback checkout or environment lookup. It rebuilds Chatworks, packs
Chatworks itself, and extracts the six supplied packages plus Chatworks into an
isolated consumer. Each maintained package is a real tarball, not an installed
copy or link. The consumer checks strict declarations, browser graphs,
registrations, canonical descriptor identity and shared Lit identity.

To avoid lifecycle execution even with npm releases that run prepare despite
ignore-scripts, Chatworks is packed from an owned copy of its public packaging
surface with lifecycle scripts removed. Other manifest metadata is preserved.
This is not a certification of the release pipeline.

Only existing third-party packages are fixture links. This is not a fresh registry
or offline dependency-install proof. Registration uses a DOM shim, not browser
behavior proof; keep the separate Chromium feature and Storybook gates.
