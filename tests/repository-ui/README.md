# Repository UI checks

From the Chatworks root, after installing the documented headless development peers:

```sh
npm run test:repository-ui
```

This builds Chatworks, checks the public consumer declarations, and runs the
Chromium tests against **@jpahd/chatworks/repository-ui**. No source alias or
separate feature build is used. Playwright owns the strict loopback server at
127.0.0.1:5199, disables environment-file loading, and never reuses another server.
All data is synthetic. The fixture also works manually after `npm run build`:

```sh
node_modules/.bin/vite --config examples/repository-ui/vite.config.ts
# http://127.0.0.1:5199/examples/repository-ui/
```

The suite checks tab keyboard/pointer reorder and focus handoff; stale and
scope-isolated search/preview/tree responses; input, display, cache, depth and
aggregate-row budgets; literal rendering; factual incomplete/truncated notices;
clipboard failure/fences; and native dialog dismissal/focus.

Sixteen intentional review screenshots are retained under `screenshots/`:
`{tabs,picker,preview,tree}-{light,dark}-{wide,narrow}.png`. These are inspection
artifacts, not pixel-baseline assertions. Screenshot cases also check document
overflow. `npm run test:package -- /absolute/path/to/repokit-tarballs`
independently verifies actual tarballs, public
exports/declarations, element registration, Lit deduplication and browser graphs.

Scoped lint/format checks:

```sh
node_modules/.bin/oxlint -c oxlintrc.json src/repository-ui/
node_modules/.bin/oxfmt --check src/repository-ui/ examples/repository-ui/ tests/repository-ui/ docs/repository-ui.md docs/pi-webui-interaction-lessons.md
```

The expected Lit development-mode notice is not a browser failure. Chromium
coverage is not certification for Firefox/WebKit, screen readers, OS touch-scroll
physics or physical touchscreens. Dialog scroll containment is progressive:
the native modal remains inert and keyboard-operable where containment is not
fully enforced. There is no body/root scroll-lock script or custom focus trap.
