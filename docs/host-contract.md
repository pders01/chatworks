# Host contract

`chatworks` is a set of Lit web components that render a chat surface
over a host-injected transport. The components do not own the transport
or know how to reach a server; they consume four host interfaces via
[`@lit/context`](https://lit.dev/docs/data/context/). The default
implementation in `src/adapters/connect-rpc.ts` wraps a Connect-RPC
client; consumers can supply any object that satisfies the shape (in-
memory mock, GraphQL adapter, WebSocket bridge, etc.).

This is the v0.2.0 wire-format-agnostic contract. v0.1.x exposed the
Connect clients (`repoClient`, `chatClient`, `authClient`) as
singletons; that path is gone from the primary entry. See the
v0.2.0 [CHANGELOG](../CHANGELOG.md) for migration.

## Wiring at the app root

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
  type RepoHost,
  type ChatHost,
  type LlmConfigHost,
  type AuthHost,
} from "@pders01/chatworks";
import "@pders01/chatworks/chat-view";

@customElement("my-app")
export class MyApp extends LitElement {
  private hosts = createConnectRpcHosts(); // same-origin, cookies included

  @provide({ context: repoHostContext })
  private repoHost: RepoHost = this.hosts.repoHost;

  @provide({ context: chatHostContext })
  private chatHost: ChatHost = this.hosts.chatHost;

  @provide({ context: llmConfigHostContext })
  private llmConfigHost: LlmConfigHost = this.hosts.llmConfigHost;

  @provide({ context: authHostContext })
  private authHost: AuthHost = this.hosts.authHost;

  override render() {
    return html`<gc-chat-view repoId="myrepo"></gc-chat-view>`;
  }
}
```

`createConnectRpcHosts({ baseUrl: "https://api.example.com" })` overrides
the transport's base URL. Pass `{ transport }` to supply a fully custom
Connect transport (interceptors, custom fetch, etc.).

## The four hosts

### `RepoHost` — read-only git access

Used by: composer (`@`-mention autocomplete, `/diff` ref completion),
chat dashboard (commit list for suggestion seeding), chat view
(`[[diff]]` marker expansion).

| method | semantics |
| --- | --- |
| `listRepos()` | All repos the host exposes. |
| `listBranches({ repoId })` | Local branches + tags, ordered by committer time. |
| `listCommits({ repoId, ref?, limit, offset })` | Commits newest-first. |
| `listTree({ repoId, ref?, path })` | Directory entries at `path` under `ref` (or default branch). |
| `getDiff({ repoId, fromRef, toRef, path, … })` | Unified diff for a single file between two refs. Used by inline `[[diff from=X to=Y path=Z]]` markers. |

### `ChatHost` — sessions, messages, activity summary

Used by: chat view (session lifecycle + streaming `sendMessage`),
session sidebar (rename, pin), chat dashboard (`summarizeActivity`).

| method | semantics |
| --- | --- |
| `listSessions({ repoId })` | All chat sessions for a repo. |
| `getSession({ sessionId })` | Session metadata + full message history. |
| `sendMessage(req, { signal })` | Server stream. Emits `started`, `token`, `thinking`, `toolCall`, `toolResult`, `cardHit`, and a terminal `done` chunk. Streams MUST be cancellable via the passed `AbortSignal`. |
| `renameSession({ sessionId, title })` | Updates the session title. |
| `deleteSession({ sessionId })` | Removes the session. |
| `pinSession({ sessionId, pinned })` | Pin/unpin in the sidebar. |
| `summarizeActivity({ repoId })` | LLM-generated recap of recent commits + a short list of suggestion prompts. |

### `LlmConfigHost` — runtime LLM configuration

Used by: settings panel (full surface), connection wizard (model
discovery), composer (`/model` and `/profile` slash-command
autocomplete), chat view (active-model indicator, pre-send route
resolution, `checkModelAvailability`).

| method | semantics |
| --- | --- |
| `getConfig()` | All registered config entries (effective value + default + description + group). |
| `updateConfig({ key, value })` | Writes an override. Takes effect on the next `getConfig`. |
| `listProfiles()` | Saved LLM profiles + the active profile id. |
| `saveProfile({ profile })` | Create or update a profile. Returns the (possibly server-assigned) id. |
| `deleteProfile({ id })` | Removes the profile. |
| `activateProfile({ id })` | Switches the active profile. `id=""` deactivates (use config overrides). |
| `getProviderCatalog()` | Cached provider/model catalog (no network). |
| `refreshProviderCatalog()` | Fetches the latest catalog from upstream sources. |
| `discoverLocalEndpoints()` | Probes loopback for LM-Studio / Ollama / similar endpoints. |
| `discoverModels({ baseUrl, apiKey })` | Hits `/v1/models` (or similar) at a custom endpoint. Returns model IDs + provider name, or an `error` string. |

### `AuthHost` — session establishment

No chatworks component consumes `AuthHost` directly today. It exists
so consumer-supplied login/pairing views can route auth through the
same context plumbing. The shape covers the two flows the Connect-RPC
adapter supports (solo-local claim, multi-user ssh pairing) but
nothing in chatworks's component tree requires either.

| method | semantics |
| --- | --- |
| `whoami()` | Current principal + auth mode; empty principal means unauthenticated. |
| `logout()` | Invalidates the session. |
| `localClaim({ token })` | Trades a local-mode one-time token for a cookie. |
| `startPairing()` | Mints a pairing session (returns `sid`, short code, expiry). |
| `watchPairing({ sid })` | Server stream that emits exactly one terminal event (`paired` or `expired`). |
| `claim({ sid, claimToken })` | Consumes a `Paired` event's claim token to set the session cookie. |

## Custom hosts

Each interface is a plain TS interface — no `$typeName`, no runtime
classes. Returning the same shape is enough. Example mock for tests:

```ts
import type { ChatHost, MessageChunk } from "@pders01/chatworks";

const mockChat: ChatHost = {
  async listSessions() { return { sessions: [] }; },
  async getSession() { return { session: undefined, messages: [] }; },
  async *sendMessage(): AsyncIterable<MessageChunk> {
    yield { kind: { case: "token", value: "hello" } };
    yield {
      kind: {
        case: "done",
        value: {
          sessionId: "s1",
          userMessageId: "u1",
          assistantMessageId: "a1",
          tokenCountIn: 1,
          tokenCountOut: 1,
          model: "test",
          error: "",
        },
      },
    };
  },
  async renameSession() {},
  async deleteSession() {},
  async pinSession() {},
  async summarizeActivity() { return { summary: "", suggestions: [] }; },
};
```

## Internal layering rule

The chatworks codebase keeps the host seam clean with one
review-enforced rule:

> Code under `src/components/*` and `src/host.ts` MUST NOT import from
> `src/adapters/*` or `src/gen/*`.

`EntryType` and `MessageRole` are the only proto-derived values
components currently use, and `MessageRole` lives in `src/lib/chat-
types.ts` as a host-side const. `EntryType` is imported from gen by
`composer.ts` because it's a runtime enum used to detect directories
in `listTree` responses — replicating it host-side is on the v0.3+
list if the proto package is ever renamed.
