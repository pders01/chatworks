# Contributing

Use Node 22+, Bun, and Chromium for the existing browser tests. Keep component
contracts separate from host services and application policy.

## Install development dependencies

The source-reading peers are not yet published. Obtain a matching set of all six
Repokit npm tarballs, then choose its directory explicitly:

```sh
ARTIFACTS=/absolute/path/to/repokit-tarballs
bun install --frozen-lockfile --ignore-scripts --no-env-file
npm run dev:artifacts -- "$ARTIFACTS"
npm run build
```

The required package identities/versions are declared in
[`expectedArtifacts`](scripts/lib/artifacts.mjs). There is no assumed source
checkout location. To produce the bundle yourself, run this **inside a Repokit
checkout you choose**:

```sh
npm ci
npm run build
mkdir -p "$ARTIFACTS"
npm pack --workspaces --ignore-scripts --pack-destination "$ARTIFACTS"
```

Use a clean bundle directory: one tarball per package, all from the same build.
This is trusted local tooling, not a security sandbox. Validation checks exact
identities/versions, dependency closure, MIT notices and compiled exports, and
refuses unsafe paths/member types. Limits are 64 MiB per archive, 128 MiB per set,
16 MiB per file and 10,000 members per archive.

The entire bundle is validated before replacement; an exclusive lock rejects
concurrent staging. Only its six dependency directories in node_modules are
replaced. Staging rejects linked targets and does not fetch packages, execute
lifecycle scripts, create CLI shims or change manifests/lockfiles. Restage after
any dependency reinstall or new bundle; do not commit tarballs.

Ordinary replacement errors roll back. Staging is not crash-safe: if a killed
process leaves node_modules/.chatworks-artifacts.lock, inspect the retained staging
backups before removing the lock manually.

## Catalog and examples

```sh
npm run storybook          # builds public entries, then serves the catalog
npm run storybook:build    # static catalog in storybook-static/
```

Use the toolbar to inspect light/dark modes and narrow layouts. Stories should
show the current public API, not project history or an application roadmap:

- Import compiled public entries; do not mix source and dist registrations.
- Separate standalone components from host-connected compositions.
- Keep fixtures synthetic, deterministic and backend-free; reset their state per
  story and clean up listeners, timers and controllers.
- Include meaningful empty/loading/error/read-only states and keyboard/event
  assertions. Keep axe enabled and fixtures small enough for its normal budget;
  stress bounds belong in the focused browser suites.
- Style only fixture-owned content, not a catalog-wide component skin. Use native
  controls and review visual changes in light/dark and wide/narrow layouts.

For component-development HMR, start the catalog first, then run
`npm run build:watch` in a second terminal. Standalone examples live under
`examples/`; their READMEs contain launch commands.

## Verify

```sh
npm run check
npm run lint
npm test
npm run test:tooling
npm run test:package -- "$ARTIFACTS"
npm run test:source-annotations
npm run test:commits-reader
npm run test:repository-ui
npm run test:storybook
```

Install the project's pinned Playwright Chromium once if it is missing. Run
build/browser gates sequentially: each feature runner owns a strict loopback port.

The packed check rebuilds Chatworks and extracts seven maintained package
artifacts into an isolated consumer. To prevent lifecycle execution, Chatworks is
packed from an owned copy of its packaging surface with scripts omitted. Only
third-party dependencies use installed fixtures; this is not a fresh registry or
offline reinstall test. DOM-shim registration checks do not replace real-browser
behavior tests. The Storybook matrix covers Chromium desktop light/dark and
mobile dark; it is not cross-browser or assistive-technology certification.

Keep task progress and one-off verification results in ignored local notes.
Public docs describe current contracts and support limits, not migration diaries.
