# Source annotations example

Synthetic browser demo for `@jpahd/chatworks/source-annotations`. The injected
`MemoryAnnotationClient` checks optimistic revisions and supplies deterministic
provenance. Changes reset on reload; no backend, environment file, browser storage
or live data is used.

From the Chatworks root, after [artifact setup](../../CONTRIBUTING.md):

```sh
npm run build
node_modules/.bin/vite --config examples/source-annotations/vite.config.ts
# http://127.0.0.1:5198/
```

Do not run the manual server alongside Playwright: both own strict loopback port 5198. Vite disables environment-file loading. The demo and minimal fixture bridge
consume the normal compiled public export, not a source alias or substitute build.

## States

The toolbar uses query parameters:

- `theme=light|dark`
- `state=populated|empty|edit|compose|error|empty-file|readonly|long`
- `narrow=1` limits specimen width; resize the page to inspect actual narrow layout.

For example, `/?theme=dark&state=compose&narrow=1`. Select gutter lines, extend with
Shift-click/Shift+Up/Down, add/cancel/edit notes or inspect provenance. Long source
uses 500-line pages. Highlighter fragments contain escaped synthetic source only.

`fixture.html` imports the same compiled entry without mounting the demo, allowing
tests to supply controlled clients through public properties.

Run `npm run test:source-annotations` for the browser suite. Captures/traces go to
ignored test-results directories; screenshots are review references, not pixel
assertions. See [the component guide](../../docs/source-annotations.md) for contracts,
trust boundaries and support limits.
