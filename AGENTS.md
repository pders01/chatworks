# Chatworks

Read README.md and CONTRIBUTING.md before changing feature ownership or tooling.
This is the browser UI home, not a repository service or application shell.

- Keep source-reading features optional under /source-annotations, /commits-reader
  and /repository-ui. Do not silently add them to the default barrel.
- Headless contracts/state/services belong in the separate repository capability
  workspace. No headless dependency may import Chatworks or Lit.
- git-chat owns the Go wire schema. src/gen compatibility modules forward canonical
  protocol exports; do not duplicate descriptors or rename the wire namespace.
- Direct Node use and git-chat RPC coexist. git-chat has no annotation RPC; do not
  invent parity or upload private notes automatically.
- Preserve immutable identities, explicit bounds/refusals, scoped drafts/caches,
  stale-response AND stale-control fencing, revision checks and read-only policy.
  UI policy/provenance never substitutes for backend authorization.
- Use injected clients and semantic intents. Do not import Node services,
  filesystem/auth/session ownership or Pi runtime into browser components.
- Read the focused Lit and modern-web guidance before substantive UI changes.
  Reuse existing Chatworks styles; do not add a parallel design system.
- No cross-repository filesystem dependencies, overrides or default checkout
  locations. Peer metadata uses normal versions. Development stages explicitly
  supplied npm tarballs; follow CONTRIBUTING.md. Restage after a
  dependency reinstall or new bundle. Tests/examples use public compiled exports.
- Check types, existing unit tests, artifact-tooling regressions, real packed
  artifacts (explicit bundle argument) and affected Chromium
  suites. Visually inspect every migrated/created UI in light/dark and wide/narrow
  states. Subagent completion and DOM-shim registration are not browser proof.
- Use synthetic fixtures and explicit disposable private stores only. Do not read
  credentials, env files or live annotation/application stores.
- Preserve unrelated work. No push, publication, remote changes, broad upgrades
  or data/schema migration without approval. Our code is MIT; preserve third-party
  notices. APIs remain experimental unless explicitly stabilized.
- Keep local task progress/plans in the owning repo, not the cross-project HQ.
  Use the existing Conventional Commits convention and change-focused messages.
