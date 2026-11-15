# Commits reader example

From the Chatworks root, follow [explicit artifact setup](../../docs/development-artifacts.md)
and run `npm run build`, then:

```sh
node_modules/.bin/vite --config examples/commits-reader/vite.config.ts
# http://127.0.0.1:5197/
```

Uses the actual `@jpahd/chatworks/commits-reader` compiled export and synthetic providers.
No backend, live repository or credentials. States are selected via the toolbar or
`?theme=dark&state=partial`. Public component properties and semantic intents are
the only integration seam; the fixture is development-only under stories/fixtures.

`npm run test:commits-reader` checks all twelve fixture states in both themes and
desktop/narrow viewports, source escaping, navigation, filtering and split diffs.
Screenshots are ignored review artifacts, not visual goldens. This does not certify
native Git/GitChat parity, every browser, or assistive technology.
