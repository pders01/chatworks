# Host contracts

Chat components consume capabilities through
[`@lit/context`](https://lit.dev/docs/data/context/). Interfaces/contexts live in
`@jpahd/chatworks/host`. Any object with the same shape can provide an in-memory,
GraphQL, WebSocket or native bridge; components do not own transport or authority.

The optional [repository UI](repository-ui.md), [Commits reader](commits-reader.md)
and [source annotations](source-annotations.md) use separate explicit client/provider
contracts. They are not automatically bridged to `RepoHost`.

## Wiring at the application root

The optional Connect adapter targets a host-selected server:

```ts
import { LitElement, html } from "lit";
import { provide } from "@lit/context";
import { customElement } from "lit/decorators.js";
import {
  chatHostContext,
  llmConfigHostContext,
  type ChatHost,
  type LlmConfigHost,
} from "@jpahd/chatworks/host";
import { createConnectRpcHosts } from "@jpahd/chatworks/adapters/connect-rpc";
import "@jpahd/chatworks/chat-view";

@customElement("my-app")
export class MyApp extends LitElement {
  private hosts = createConnectRpcHosts(); // Same-origin; cookies included.

  @provide({ context: chatHostContext })
  private chatHost: ChatHost = this.hosts.chatHost;

  @provide({ context: llmConfigHostContext })
  private llmConfigHost: LlmConfigHost = this.hosts.llmConfigHost;

  override render() {
    return html`<cw-chat-view></cw-chat-view>`;
  }
}
```

`createConnectRpcHosts({ baseUrl: "https://api.example.com" })` selects another
base URL; `{ transport }` accepts a custom Connect transport. This entry needs
the protocol/Connect peers; a custom host need not use it.

Provide `RepoHost` for repository-backed suggestions/diff markers. `AuthHost` is
optional and no component consumes it directly. Hosts must enforce authorization,
bind requests to their original scope and avoid silently changing authority behind
stable provided objects. UI availability/read-only flags are not security controls.

## RepoHost: optional read-only Git access

Consumed by the composer (file/ref completion and previews), chat dashboard
(commit suggestions) and chat view (inline diff markers). Without it, repository
features are omitted rather than replaced with ambient reads.

| Method                                                | Semantics                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `listRepos({})`                                       | Repositories the host exposes                                                              |
| `listBranches({ repoId })`                            | Separate branches and tags arrays                                                          |
| `listCommits({ repoId, ref?, path?, limit, offset })` | Newest-first commits, optional exact-path filter, `hasMore` for paging                     |
| `listTree({ repoId, ref?, path })`                    | Directory entries plus resolved ref                                                        |
| `getFilePreview?({ repoId, ref?, path })`             | Host-bounded composer preview, preserving binary/truncated facts                           |
| `getBlame?({ repoId, ref?, path })`                   | Optional 1-based attribution, short SHA and full SHA when available                        |
| `getDiff({ repoId, fromRef, toRef, path, … })`        | Unified diff and resolved endpoints; supports explicit rename/full-range/file-list options |

Set `cw-composer.fileMentionsDisabled=true` while a draft lacks an allocated
workspace. It suppresses repository-backed file suggestions/previews and `/diff`
completion. Supply its allocated `repoId` and clear the flag to resume on input.
Changing repoId, RepoHost or the flag clears scoped completion/preview caches and
fences pending responses **without resetting draft, attachments or focus**.
Use distinct draft repoIds for distinct workspace placements; their format is
host-owned.

## ChatHost: sessions and streaming

Consumed by chat view/session sidebar and the activity dashboard.

| Method                                | Semantics                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `listSessions({ repoId })`            | Sessions for the selected repository                                                                   |
| `getSession({ sessionId })`           | Session metadata and full message history                                                              |
| `sendMessage(req, { signal })`        | Async stream: started/token/thinking/toolCall/toolResult/cardHit and terminal done; honor cancellation |
| `renameSession({ sessionId, title })` | Rename                                                                                                 |
| `deleteSession({ sessionId })`        | Remove                                                                                                 |
| `pinSession({ sessionId, pinned })`   | Pin/unpin                                                                                              |
| `summarizeActivity({ repoId })`       | Activity summary and suggested prompts                                                                 |

`sendMessage` accepts sessionId, repoId, text, optional attachments and optional
`replaceFromMessageId`. An empty repoId is valid for hosts without a repository
concept; repository-routing hosts must define its default meaning explicitly.

A plain mock needs no generated message classes:

```ts
import type { ChatHost, MessageChunk } from "@jpahd/chatworks/host";

const mockChat: ChatHost = {
  async listSessions() {
    return { sessions: [] };
  },
  async getSession() {
    return { session: undefined, messages: [] };
  },
  async *sendMessage(_request, options): AsyncIterable<MessageChunk> {
    if (options?.signal?.aborted) return;
    yield { kind: { case: "token", value: "hello" } };
    if (options?.signal?.aborted) return;
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
  async summarizeActivity() {
    return { summary: "", suggestions: [] };
  },
};
```

## LlmConfigHost: configuration and discovery

Consumed by settings, connection wizard, composer model/profile completion and
chat view model/route availability checks. The host decides where configuration
lives and which discovery/network operations are authorized.

| Method                                | Semantics                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `getConfig({})`                       | Effective config entries, defaults, descriptions and groups                         |
| `updateConfig({ key, value })`        | Write an override                                                                   |
| `listProfiles({})`                    | Saved profiles and active ID                                                        |
| `saveProfile({ profile })`            | Create/update; return its ID                                                        |
| `deleteProfile({ id })`               | Remove                                                                              |
| `activateProfile({ id })`             | Select; empty ID deactivates the profile                                            |
| `getProviderCatalog({})`              | Current cached catalog, without requesting upstream refresh                         |
| `refreshProviderCatalog({})`          | Request a refreshed provider/model catalog                                          |
| `discoverLocalEndpoints({})`          | Host-controlled loopback endpoint discovery                                         |
| `discoverModels({ baseUrl, apiKey })` | Host-controlled endpoint model lookup; returns IDs/provider name or an error string |

## AuthHost: host-owned authentication views

No Chatworks component consumes this context directly. Supply it for your own
login/pairing shell if useful. The interface covers the Connect adapter's local
claim and SSH-pairing flows, not an authentication UI implemented by the library.

| Method                       | Semantics                                               |
| ---------------------------- | ------------------------------------------------------- |
| `whoami({})`                 | Principal/auth mode; empty principal is unauthenticated |
| `logout({})`                 | Invalidate session                                      |
| `localClaim({ token })`      | Exchange a one-time local token for a session           |
| `startPairing({})`           | Pairing ID, short code and expiry                       |
| `watchPairing({ sid })`      | Async paired/expired terminal event                     |
| `claim({ sid, claimToken })` | Establish session from the pairing claim token          |

## Component layering

Components and the host seam do not import adapters or generated protocol modules.
`EntryType` in `/host` and `MessageRole` in `/chat-types` are plain host-side
constants. Generated descriptors remain separate compatibility exports; custom
hosts do not need `$typeName` or generated runtime classes.
