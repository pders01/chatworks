# chatworks

Drop-in chat surface for embedding an LLM chat into a web app. Ships Lit
web components, a Connect-RPC transport, model-catalog discovery, a
slash-command engine, markdown + Shiki rendering, and a runtime settings
panel.

Originally extracted from [git-chat](https://github.com/pders01/git-chat);
designed to be reusable across any app that speaks the same RPC
contract.

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
<gc-chat-view active-repo="my-repo" focus-mode="off"></gc-chat-view>
<gc-settings-panel open></gc-settings-panel>
<gc-toast></gc-toast>
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
| `.../chat-view`        | `<gc-chat-view>` registration                        |
| `.../settings-panel`   | `<gc-settings-panel>` registration                   |
| `.../toast`, `.../loading-indicator`, `.../combobox` | Standalone UI primitives          |
| `.../transport`        | Connect-RPC client singletons (`repoClient`, `chatClient`, `authClient`) |
| `.../settings`         | Theme + CSS-variable preference store, with host-theme override hooks |
| `.../events`           | Event-payload types + `HTMLElementEventMap` augmentation |
| `.../catalog`          | Model catalog (providers, models, pricing)           |
| `.../slash`            | Slash-command parser + suggestion engine             |
| `.../attachments`      | @-mention attachment helpers                         |
| `.../markdown`, `.../highlight`, `.../clipboard`, `.../focus` | Misc helpers   |
| `.../proto/{auth,chat,repo}` | Generated protobuf clients + message types     |

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
bun run check    # tsc --noEmit
bun run test     # bun:test (happy-dom harness)
bun run lint     # oxlint
bun run fmt      # oxfmt
```

## License

MIT
