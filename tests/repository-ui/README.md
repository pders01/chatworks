# Repository UI checks

From the Chatworks root, after [artifact setup](../../CONTRIBUTING.md):

```sh
npm run test:repository-ui
```

This builds Chatworks, checks public declarations and runs Chromium against
`@jpahd/chatworks/repository-ui`. No source alias or feature-only build is used.
Playwright owns strict loopback port 5199, disables environment-file loading and
does not reuse another server. All data is synthetic. For manual inspection:

```sh
npm run build
node_modules/.bin/vite --config examples/repository-ui/vite.config.ts
# http://127.0.0.1:5199/examples/repository-ui/
```

Coverage includes tab reorder/focus handoff; scope/client-isolated async reads;
input/display/cache/depth/row budgets; literal rendering; incomplete/truncated
facts; clipboard failure/fences; and native dialog dismissal/focus. The
[supported contracts](../../docs/repository-ui.md) remain the source of consumer guidance.

`screenshots/{tabs,picker,preview,tree}-{light,dark}-{wide,narrow}.png` are curated
review references, not pixel-baseline assertions. Generated captures are ignored.
Chromium does not certify other browsers, screen readers, physical touch or OS
clipboard policy. Dialog scroll containment is progressive; there is no scripted
body lock or custom focus trap. Packed artifacts are a separate gate described in
[contributing](../../CONTRIBUTING.md).
