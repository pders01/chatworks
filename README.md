# chatworks

Composable web components and workbench infrastructure for AI-assisted web
applications. Chatworks ships chat and diff surfaces, lower-level UI primitives,
and an extension runtime for composing arbitrary productivity workflows such as
canvases, boards, editors, and project dashboards.

Originally extracted from [git-chat](https://github.com/pders01/git-chat), the
library no longer assumes that chat is the complete application shell. Hosts own
their transport and domain services; extensions contribute views, commands, and
host-defined capabilities through browser-native contracts.

## Install

```bash
bun add @jpahd/chatworks
# or
npm i  @jpahd/chatworks
```

Peer dependencies: `lit`, `@bufbuild/protobuf`, `@connectrpc/connect`,
`@connectrpc/connect-web`.

> The npm scope is `@jpahd` even though this repo lives under the
> `pders01` GitHub org — the npm username is `jpahd`.

## Usage

```ts
// main.ts — boot the chat surface
import "@jpahd/chatworks";              // registers all custom elements
import { settings } from "@jpahd/chatworks";

settings.applyAll();                      // apply persisted theme + CSS vars
```

```html
<!-- somewhere in your app shell -->
<cw-chat-view repo-id="my-repo"></cw-chat-view>
<cw-settings-panel open></cw-settings-panel>
<cw-toast></cw-toast>
```

The components dispatch typed `gc:*` events that bubble through shadow
roots (`composed: true`). Consume them with native
`addEventListener`; the package's `lib/events.ts` augments
`HTMLElementEventMap` so payload types come through automatically:

```ts
window.addEventListener("gc:open-file", (e) => {
  router.go({ tab: "browse", path: e.detail.path });
});
```

## Public API

Subpath exports map to the underlying source so apps can pull only the
pieces they need:

| Subpath                | What it gives you                                    |
|------------------------|------------------------------------------------------|
| `@jpahd/chatworks`              | Default barrel — registers components, re-exports runtime singletons |
| `.../chat-view`        | `<cw-chat-view>` registration                        |
| `.../composer`, `.../message-list`, `.../session-sidebar` | Lower-level chat primitives for custom shells |
| `.../diff-view`        | Transport-independent `<cw-diff-view>` unified/split renderer |
| `.../diff`             | Pure diff HTML transforms (line numbers, word and split diff) |
| `.../workbench`        | Extension host, view/command registry, services, context, and storage |
| `.../workbench-view`, `.../workbench-switcher` | Registry-driven view mounting and navigation |
| `.../command-palette`  | Searchable workbench command surface |
| `.../settings-panel`   | `<cw-settings-panel>` registration                   |
| `.../toast`, `.../loading-indicator`, `.../combobox` | Standalone UI primitives          |
| `.../transport`        | Connect-RPC client singletons (`repoClient`, `chatClient`, `authClient`) |
| `.../settings`         | Theme + CSS-variable preference store, with host-theme override hooks |
| `.../events`           | Event-payload types + `HTMLElementEventMap` augmentation |
| `.../catalog`          | Model catalog (providers, models, pricing)           |
| `.../slash`            | Slash-command parser + suggestion engine             |
| `.../attachments`      | @-mention attachment helpers                         |
| `.../markdown`, `.../highlight`, `.../clipboard`, `.../focus` | Misc helpers   |
| `.../proto/{auth,chat,repo}` | Generated protobuf clients + message types     |

## Workbench extensions

The workbench API lets a host expose abstract services while extensions register
arbitrary custom-element views, commands, and host-defined contributions. It has
no dependency on the Connect-RPC chat contract.

```ts
import { WorkbenchExtensionHost, WorkbenchRegistry } from "@jpahd/chatworks/workbench";

const registry = new WorkbenchRegistry();
registry.services.provide("my-app.assistant", assistant);
const extensions = new WorkbenchExtensionHost(registry);
await extensions.activate(myExtension);
```

See [the workbench and extension contract](docs/workbench.md) for lifecycle,
mounting, state, command-palette, and board-style examples.

## Backend contract

chatworks ships the TypeScript stubs for a Connect-RPC contract:

- `gitchat.v1.AuthService`  — pairing / session auth
- `gitchat.v1.ChatService`  — sessions, messages, summaries
- `gitchat.v1.RepoService`  — repo metadata, model catalog, settings

Any backend that implements these services can host the chatworks UI.
See the consumer (git-chat) for a Go + connectrpc-go reference
implementation.

> The proto package is still named `gitchat.v1` for historical reasons;
> a rename to `chatworks.v1` is on the roadmap.

## Embedding host hooks

The settings module reads `data-theme` overrides and resolved design
tokens posted from a host (e.g. a VS Code webview). Wire them up at
boot:

```ts
import { settings } from "@jpahd/chatworks";

window.addEventListener("message", (e) => {
  if (e.source !== window.parent) return;
  if (e.data?.type === "gc.theme")  settings.setHostTheme(e.data.theme);
  if (e.data?.type === "gc.tokens") settings.setHostTokens(e.data.tokens);
});
```

The host-token allow-list is fixed (15 entries) — anything outside it is
ignored, so a hostile host can't inject arbitrary CSS variables.

## Development

```bash
bun install
bun run storybook        # component catalog on http://localhost:6006
bun run storybook:build  # static catalog in storybook-static/
bunx playwright install chromium # once, for browser story tests
bun run test:storybook   # Chromium render + axe matrix
bun run check            # tsc --noEmit, including stories
bun run test             # bun:test (happy-dom harness)
bun run lint             # oxlint
bun run fmt              # oxfmt
```

Storybook covers the chat, composer, message, session, settings, diff,
workbench, input, loading, and notification surfaces. Use its toolbar to switch
light/dark tokens and its accessibility panel to inspect the active story. The
browser test runs every story in Chromium at desktop dark, desktop light, and
mobile dark viewports and fails on component accessibility violations.

## License

MIT
