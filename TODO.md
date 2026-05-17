# chatworks — TODO

## Where we are

- Lit web component library for embedding LLM chat into any web app.
- Host-injection contract: `RepoHost`, `ChatHost`, `LlmConfigHost`, `AuthHost`
  consumed via `@lit/context`. Zero transport imports in components.
- Default Connect-RPC adapter at `src/adapters/connect-rpc.ts`.
- Ships `dist/` with `.d.ts` + `.js` (not raw `.ts` source).
- Tags: `v0.1.0`, `v0.2.0`, `v0.2.1`, `v0.3.0`.

## Done since v0.2.0

- [x] Ship `dist/` with `.d.ts` declarations; `exports` map points at
  `dist/*.js` + `dist/*.d.ts`. Consumers control their own tsconfig
  strictness.
- [x] Rename custom-element tags `gc-*` → `cw-*`.
- [x] Default `sessionMaxCostKey` to `""` (disabled) instead of
  `"GITCHAT_SESSION_MAX_COST_USD"`.
- [x] Add `chunk` constructor helpers (`chunk.token()`, `chunk.done()`,
  etc.) exported from `@jpahd/chatworks/chunk`.
- [x] Make empty-state copy overridable via `<slot name="empty-state">`.
- [x] Document `RepoHost` and `AuthHost` as optional in host-contract.md.
- [x] Remove `repoId` truthiness guard that blocked `loadSessions()` for
  repo-free consumers.
- [x] Import-rule enforcement test (`src/import-rules.test.ts`).
- [x] CI workflow (typecheck, test, lint, fmt:check).

## Open

### Breaking (save for v0.4.0)

- [ ] **Proto package rename** (`gitchat.v1` → `chatworks.v1` or `chat.v1`).
  The TS layer is already proto-free in public surface; only codegen
  artifacts and doc strings still say `gitchat`. Renaming buys real
  reuse only if a second backend consumer appears; otherwise cosmetic.
  Requires coordinated commit with git-chat (Go imports + `make proto`).

- [ ] **Remove `createConnectRpcHosts` re-export from `index.ts`.**
  The main entry currently re-exports the adapter, which forces every
  consumer (even in-memory-only ones) to pull `@connectrpc/connect`,
  `@connectrpc/connect-web`, and `@bufbuild/protobuf` transitively.
  The adapter already has its own subpath (`/adapters/connect-rpc`).
  Consumers that need it would change their import; non-RPC consumers
  slim down significantly.

### Non-breaking

- [ ] **Publish to npm.** Currently consumed via `file:../chatworks`.
  Requires npm auth, then switching git-chat's `package.json` from
  `file:` to `"@jpahd/chatworks": "^0.3.0"`.

- [ ] **De-brand audit.** Remaining `git-chat` mentions:
  - `README.md` — historical attribution (legitimate, leave)
  - `src/components/chat-view.ts:99` — comment about `sessionMaxCostKey`
    back-compat default. Reword to "host application's existing key".
  - `src/gen/gitchat/v1/*` — goes away with proto rename above.

- [ ] **Clean up `llmConfigHost` cast in adapter.**
  `createConnectRpcHosts` casts the repo client to `LlmConfigHost`:
  `llmConfigHost: repoClient as unknown as LlmConfigHost`. This works
  only because git-chat's Go backend happens to serve LLM config RPCs
  from the Repo service. It's not a generic pattern — a standalone
  backend would likely have a separate LlmConfig service. Consider
  splitting the adapter into per-service hosts or documenting that the
  cast is git-chat-specific.

## Do not

- Do not amend published tags (`v0.1.0` through `v0.3.0`).
- Do not move the Connect-RPC adapter out of chatworks.
- Do not bake product-specific strings into components; use slots/properties.
