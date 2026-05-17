# Changelog

## v0.3.0 — optional RepoHost, dist/ build, npm rename, cw-* tags

Batch of friction-point fixes informed by implementing a from-scratch
consumer ([chat-standalone](https://github.com/pders01/chat-standalone)).
Breaking on three axes: package name, component tags, build artifact
location.

### Breaking changes

**npm package renamed** `@pders01/chatworks` → `@jpahd/chatworks`.
The GitHub repo still lives at `pders01/chatworks`; only the npm
scope changes (npm username is `jpahd`).

**Custom-element tags renamed** `gc-*` → `cw-*` across the board:

| before | after |
| --- | --- |
| `<gc-chat-view>` | `<cw-chat-view>` |
| `<gc-settings-panel>` | `<cw-settings-panel>` |
| `<gc-toast>` | `<cw-toast>` |
| `<gc-loading-banner>` | `<cw-loading-banner>` |
| `<gc-spinner>` | `<cw-spinner>` |
| `<gc-connection-wizard>` | `<cw-connection-wizard>` |
| `<gc-combobox>` | `<cw-combobox>` |
| `<gc-composer>` | `<cw-composer>` |
| `<gc-chat-dashboard>` | `<cw-chat-dashboard>` |
| `<gc-message-list>` | `<cw-message-list>` |
| `<gc-session-sidebar>` | `<cw-session-sidebar>` |

Event names (`gc:toast`, `gc:open-file`, `gc:focus-changed`, etc.)
are unchanged — they're internal strings, not part of the public
element surface.

**Build artifact location** — the `exports` map now points at
compiled `dist/*.js` and `dist/*.d.ts` instead of source `.ts`
files. Consumers using `file:../chatworks` MUST run `bun run build`
in chatworks before importing (or `bun run build:watch` for active
dev). Published npm consumers get `dist/` from the tarball with no
extra step.

**`sessionMaxCostKey` default changed** on `<cw-chat-view>` —
empty string instead of `"GITCHAT_SESSION_MAX_COST_USD"`. git-chat
consumers must now set this property explicitly at the call site
to preserve the old behavior. Empty string disables the
`LlmConfigHost.getConfig()` lookup and uses the compiled
`sessionMaxCostUsd` default.

### Added

- `RepoHost` is now optional on `<cw-chat-view>`. A consumer that
  doesn't `@provide` `repoHostContext` gets a working chat surface
  with file-mention completion, branch picker, and the recent-
  activity panel silently disabled. Lets a no-repo standalone chat
  mount the surface without forging a synthetic repo. The
  `ChatHost.sendMessage` request's `repoId` field now documents
  empty string as the "no repo" sentinel.
- `<cw-chat-dashboard>` exposes `<slot name="empty-state">`,
  forwarded through `<cw-chat-view>`. Consumers can swap the
  "ready when you are / ask about the repo" copy without editing
  chatworks.
- New `@jpahd/chatworks/chunk` subpath with constructor helpers
  (`chunk.token`, `chunk.started`, `chunk.done`, `chunk.cardHit`,
  `chunk.toolCall`, `chunk.toolResult`, `chunk.thinking`). Makes
  from-scratch `ChatHost.sendMessage` implementations readable
  without learning the bufbuild `{ kind: { case, value } }` shape.

### Docs

- `docs/host-contract.md` now explicitly notes that `AuthHost` is
  opt-in: no chatworks component consumes it today, so consumers
  without an auth-aware shell can skip the `@provide`.

### Migration recipe

1. Update your package.json dep from `@pders01/chatworks` to
   `@jpahd/chatworks` (same version range works).
2. Rename every `<gc-*>` element in your templates to `<cw-*>`.
   Same prefix swap for any TypeScript element class refs.
3. If you previously relied on the `GITCHAT_SESSION_MAX_COST_USD`
   key being looked up automatically, set
   `<cw-chat-view sessionMaxCostKey="GITCHAT_SESSION_MAX_COST_USD">`
   at the call site.
4. If you're using `file:../chatworks`, add `bun run build` to your
   CI/install steps before consuming. For dev, run
   `bun run build:watch` in chatworks alongside your dev server.
5. (Optional) Use the new `chunk` helpers if you maintain a custom
   `ChatHost` implementation.
6. (Optional) Provide a `<div slot="empty-state">…</div>` child on
   `<cw-chat-view>` to override the empty-state copy.

## v0.2.1 — additive: EntryType, import-rule guard, CI

No breaking changes; safe drop-in over v0.2.0.

- `EntryType` promoted to a host-side const + type in
  `src/host.ts`. `TreeEntry.type` is now typed instead of bare
  `number`. Existing proto-shaped data still satisfies the contract;
  consumers that compare against numeric literals get a
  type-narrowing benefit.
- The v0.2.0 internal rule (`src/components/*` and `src/host.ts`
  MUST NOT import from `src/adapters/*` or `src/gen/*`) is now
  enforced by `src/import-rules.test.ts`. Caught a real regression
  in `composer.ts` (which imported `EntryType` from `src/gen/`);
  fixed in the same release.
- GitHub Actions CI workflow (`.github/workflows/ci.yml`): runs
  `bun install --frozen-lockfile`, then `bun run check / test /
  lint / fmt:check` on push to main and pull requests.

## v0.2.0 — host injection

### Breaking changes

Components no longer reach for the Connect-RPC singletons directly.
They consume four host interfaces via `@lit/context` and the consumer
provides them at the app root.

**Before (v0.1.x):**

```ts
import "@jpahd/chatworks/chat-view";
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
} from "@jpahd/chatworks";
import "@jpahd/chatworks/chat-view";

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
still importable from the `@jpahd/chatworks/transport` subpath, but
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

- `@jpahd/chatworks` now exports `RepoHost`, `ChatHost`,
  `LlmConfigHost`, `AuthHost` interfaces plus their `@lit/context`
  tokens (`repoHostContext`, `chatHostContext`, `llmConfigHostContext`,
  `authHostContext`).
- `@jpahd/chatworks/host` subpath: bare-types-only entry, no
  side-effect element registrations. Useful when you only need the
  host interfaces.
- `@jpahd/chatworks/adapters/connect-rpc` subpath: just the
  `createConnectRpcHosts()` factory and `ConnectRpcHosts` type.
- `@lit/context` added as a peer dependency.
- `docs/host-contract.md` documents each host interface, the methods,
  and the surfaces that consume them.

### Removed

- `authClient`, `chatClient`, `repoClient` re-exports from the
  package's main entry. Still available via `@jpahd/chatworks/transport`.

### Migration recipe

1. Bump `@jpahd/chatworks` to `^0.2.0`.
2. Install `@lit/context` if you don't already have it.
3. At your app root, build a hosts bundle and provide each via context:
   - For unchanged Connect-RPC same-origin behavior, call
     `createConnectRpcHosts()` with no args.
   - For a different base URL, pass `{ baseUrl }`.
   - For full transport control, pass `{ transport }` from your own
     `createConnectTransport(...)` call.
4. If you were importing `authClient`/`chatClient`/`repoClient` from
   `@jpahd/chatworks`, switch to `@jpahd/chatworks/transport` or
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
