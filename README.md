# Chatworks

Composable Lit components for chat, source reading, and extension-based
workspaces. Use individual components or compose them into a host-owned
application; Chatworks does not own your backend, repository access, or routing.

## Install and use

```sh
npm install @jpahd/chatworks
```

Lit 3 and `@lit/context` are peers. The default, transport and protocol entries
also need Protobuf, Connect, and `@jpahd/git-chat-protocol`. The experimental source-reading entries
use additional peers listed below. A peer marked optional for installation is
still required by an entry that imports it.

**This checkout contains unreleased source-reading features.** Building it
currently requires a matching bundle of unpublished Repokit packages; see
[contributing](https://github.com/pders01/chatworks/blob/main/CONTRIBUTING.md).
An existing registry release does not necessarily contain these entries.

A standalone chat turn needs no transport:

```ts
import "@jpahd/chatworks/chat-turn";
import { MessageRole } from "@jpahd/chatworks/chat-types";

const turn = document.createElement("cw-chat-turn");
turn.turn = { id: "example", role: MessageRole.ASSISTANT, content: "Ready for review." };
document.body.append(turn);
```

Importing a component entry registers its custom element. Pass objects through
JavaScript properties, not serialized attributes. Components report user actions
through DOM events; event names and payloads depend on the component.

## Entry points

All entries below use the `@jpahd/chatworks` prefix and resolve to compiled ESM
and TypeScript declarations.

| Entry                                                                       | Purpose                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Default entry                                                               | Chat/workbench registrations, host contracts, adapter and common helpers |
| `/chat-view`, `/composer`, `/message-list`, `/session-sidebar`              | Host-connected chat compositions                                         |
| `/chat-turn`, `/attachment`, `/thinking-disclosure`, `/tool-event`          | Smaller chat content components                                          |
| `/repository-ui`                                                            | File tabs, file picker, source preview and lazy repository tree          |
| `/source-annotations`                                                       | Source selection and private-note presentation with an injected client   |
| `/commits-reader`                                                           | Commit history and diffs with an injected provider                       |
| `/diff-view`, `/diff`, `/commit-graph`                                      | Diff component and rendering/graph helpers                               |
| `/workbench`, `/workbench-view`, `/workbench-switcher`, `/command-palette`  | Extension lifecycle, views and commands                                  |
| `/host`, `/adapters/connect-rpc`                                            | Host interfaces/contexts and an optional Connect adapter                 |
| `/settings-panel`, `/settings`, `/combobox`, `/loading-indicator`, `/toast` | Configuration, input and feedback                                        |
| `/proto/auth`, `/proto/chat`, `/proto/repo`                                 | Canonical GitChat protocol compatibility exports                         |
| `/events`, `/chat-types`, `/markdown`, `/highlight`                         | Event/data types and text presentation helpers                           |

The `/proto/*` entries forward canonical `@jpahd/git-chat-protocol` descriptors
without copying/wrapping them; GitChat owns the Go wire schema.

The three source-reading entries are **experimental and excluded from the
default barrel**:

- [`/repository-ui`](docs/repository-ui.md) uses structural clients and has no
  headless runtime dependency.
- [`/source-annotations`](docs/source-annotations.md) references
  `@jpahd/source-annotations/contracts` for types, not its Node service.
- [`/commits-reader`](docs/commits-reader.md) uses `@jpahd/commits-core` for shared
  contracts and runtime state.

## Host responsibilities

Chat components consume host capabilities through `@lit/context`; source-reading
components accept explicit clients/providers. Hosts own authentication, repository
scope, immutable snapshot resolution, persistence and navigation. UI read-only
state and event provenance do not replace backend authorization or revision checks.

Repokit owns headless Git/annotation services and neutral contracts/state; its
packages do not depend on Chatworks or Lit. Native Node libraries and RPC bridges
are alternative host implementations.
GitChat is an optional Go backend, not a prerequisite for transport-free UI. Its
schema supplies the existing auth/chat/repository protocol; it does not currently
provide annotation RPC. No component automatically uploads private notes.

## Guides

- [Host contracts](docs/host-contract.md): injecting chat, repository and
  configuration capabilities.
- [Workbench](docs/workbench.md): extension-owned views, commands and services.
- [Styling](docs/styling.md): browser-default presentation, CSS parts and trusted
  syntax highlighting.
- [Repository UI](docs/repository-ui.md), [source annotations](docs/source-annotations.md)
  and [Commits reader](docs/commits-reader.md): optional source-reading APIs.

Components use an enhanced browser-default baseline, not a product skin. Set an
appropriate `color-scheme`; customize exposed parts/tokens rather than internal
selectors. Hosts remain responsible for testing their composed UI.

## Development

See [contributing](https://github.com/pders01/chatworks/blob/main/CONTRIBUTING.md)
for artifact setup, Storybook, and verification commands. Storybook demonstrates
current components and host-owned compositions using synthetic data, without a
live backend. The catalog supports light/dark previews and automated axe checks.

## License

MIT
