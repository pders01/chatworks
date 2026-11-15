# Source notes — standalone Chatworks example

Synthetic, MIT-licensed browser demo for the optional
`@jpahd/chatworks/source-annotations` component. No backend, host process,
credentials, environment file, browser storage or live data. Changes are volatile
and reset on reload. The injected `MemoryAnnotationClient` checks optimistic
revisions and supplies deterministic example provenance.

From the Chatworks root, after [explicit artifact setup](../../docs/development-artifacts.md):

```sh
npm run build
node_modules/.bin/vite --config examples/source-annotations/vite.config.ts
# http://127.0.0.1:5198/
```

Do not run the manual server while running Playwright; the runner owns the same
strict loopback port. Vite uses `envDir: false` and no source/package aliases.
`main.ts` and the minimal test bridge `compiled-entry.js` both import the actual
compiled public export `@jpahd/chatworks/source-annotations`. There is no source
alias or special package implementation used only by the test fixture.

## Reproducible states

The toolbar submits query parameters, with no hidden private component state:

- `theme=light|dark`
- `state=populated|empty|edit|compose|error|empty-file|readonly|long`
- `narrow=1` limits the specimen width; resize the browser to inspect a narrow page.

For example: `/?theme=dark&state=compose&narrow=1`. Select line numbers and
Shift-click or Shift+Up/Down to extend. Add an explanation, cancel/reopen to check
drafts, edit/resolve/reopen/delete notes from Details, or inspect snapshot and
original-text disclosures. Long source uses 500-line pages. The highlighter uses
only escaped synthetic source; arbitrary HTML is not supported.

`fixture.html` is a minimal generic component test document. It imports the same
compiled entry without mounting the demo. Compatibility tests construct the
component through its public properties and inject controlled client promises.

## Automated review

```sh
npm run build && \
node_modules/.bin/tsc -p tests/source-annotations/tsconfig.json && \
node_modules/.bin/playwright test -c tests/source-annotations/playwright.config.ts
```

The runner uses existing Chatworks `playwright/test` and Vite executables. It writes
screenshots/traces only to ignored `tests/source-annotations/test-results/` and
keeps its Vite cache under the same test directory. The 28-state screenshot matrix
is an inspection artifact, not a golden comparison. See
[the component contract and migration coverage](../../docs/source-annotations.md)
for peer requirements, preserved compatibility tests and verification gaps.
