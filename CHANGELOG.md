# Changelog

## v0.2.0 — host injection

### Breaking changes

Components no longer reach for the Connect-RPC singletons directly.
They consume four host interfaces via `@lit/context` and the consumer
provides them at the app root.

**Before (v0.1.x):**

```ts
import "@pders01/chatworks/chat-view";
// chat-view imported chatClient / repoClient internally; consumer
// just rendered the element and the transport singleton handled
// the rest.
```

**After (v0.2.0):**

```ts
import { LitElement, html } from "lit";
import { provide } from "@lit/context";
import { customElement } from "lit/decorators.js";
import {
  createConnectRpcHosts,
  repoHostContext,
  chatHostContext,
  llmConfigHostContext,
  authHostContext,
} from "@pders01/chatworks";
import "@pders01/chatworks/chat-view";

@customElement("my-app")
export class MyApp extends LitElement {
  private hosts = createConnectRpcHosts();
  @provide({ context: repoHostContext }) repoHost = this.hosts.repoHost;
  @provide({ context: chatHostContext }) chatHost = this.hosts.chatHost;
  @provide({ context: llmConfigHostContext }) llmConfigHost = this.hosts.llmConfigHost;
  @provide({ context: authHostContext }) authHost = this.hosts.authHost;

  override render() {
    return html`<gc-chat-view repoId="myrepo"></gc-chat-view>`;
  }
}
```

The transport-singleton re-exports (`authClient`, `chatClient`,
`repoClient`) have been removed from the primary entry point. They're
still importable from the `@pders01/chatworks/transport` subpath, but
that bypasses the host seam the components are built around — prefer
`createConnectRpcHosts()` and host injection.

### De-branding

User-visible references to `git-chat`-specific config keys are gone
from the components. Two new properties expose the previous hard-
coded names as overridable defaults so existing git-chat usage works
unchanged:

- `<gc-chat-view>` gained `sessionMaxCostKey` (default `"GITCHAT_SESSION_MAX_COST_USD"`).
- `<gc-settings-panel>` gained `configKeyPrefix` (default `"GITCHAT_"`).

Standalone consumers can set those to their own naming, or to the
empty string to disable the lookup / prefix-strip entirely.

### Added

- `@pders01/chatworks` now exports `RepoHost`, `ChatHost`,
  `LlmConfigHost`, `AuthHost` interfaces plus their `@lit/context`
  tokens (`repoHostContext`, `chatHostContext`, `llmConfigHostContext`,
  `authHostContext`).
- `@pders01/chatworks/host` subpath: bare-types-only entry, no
  side-effect element registrations. Useful when you only need the
  host interfaces.
- `@pders01/chatworks/adapters/connect-rpc` subpath: just the
  `createConnectRpcHosts()` factory and `ConnectRpcHosts` type.
- `@lit/context` added as a peer dependency.
- `docs/host-contract.md` documents each host interface, the methods,
  and the surfaces that consume them.

### Removed

- `authClient`, `chatClient`, `repoClient` re-exports from the
  package's main entry. Still available via `@pders01/chatworks/transport`.

### Migration recipe

1. Bump `@pders01/chatworks` to `^0.2.0`.
2. Install `@lit/context` if you don't already have it.
3. At your app root, build a hosts bundle and provide each via context:
   - For unchanged Connect-RPC same-origin behavior, call
     `createConnectRpcHosts()` with no args.
   - For a different base URL, pass `{ baseUrl }`.
   - For full transport control, pass `{ transport }` from your own
     `createConnectTransport(...)` call.
4. If you were importing `authClient`/`chatClient`/`repoClient` from
   `@pders01/chatworks`, switch to `@pders01/chatworks/transport` or
   build hosts and pass the four returned objects through wherever
   you need them.
5. If you renamed any config keys away from `GITCHAT_*` for your fork,
   set `<gc-chat-view sessionMaxCostKey="…">` and
   `<gc-settings-panel configKeyPrefix="…">` accordingly.

No proto / wire-format changes. The Go server side of git-chat (or
any other backend implementing `gitchat.v1`) is unaffected.

## v0.1.0 — initial extraction from git-chat

First standalone release. See git-chat commit `b634453` for the
extraction commit and `6608816` for the chatworks initial commit.
