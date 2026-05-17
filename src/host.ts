// Host interfaces — the contract chatworks components consume.
//
// Components live behind these interfaces. The default Connect-RPC
// implementation lives in src/adapters/connect-rpc.ts; consumers can
// supply any object that satisfies the shape (in-memory mocks, GraphQL
// fronts, WebSocket transports, etc.).
//
// Hard rule: this file does NOT import from src/gen/*. The interfaces
// are structurally compatible with the current proto-shaped data so
// the Connect-RPC adapter can return proto messages directly, but the
// host contract itself stays free of wire-format types so a consumer
// can satisfy it without dragging in protobuf-es.

import { createContext } from "@lit/context";

// ── Common data shapes ───────────────────────────────────────────

export interface Repo {
  id: string;
  label: string;
  defaultBranch: string;
  headCommit: string;
}

export interface Branch {
  name: string;
  commit: string;
  committerTime: bigint;
  subject: string;
}

export const EntryType = {
  UNSPECIFIED: 0,
  FILE: 1,
  DIR: 2,
  SYMLINK: 3,
  SUBMODULE: 4,
} as const;
export type EntryType = (typeof EntryType)[keyof typeof EntryType];

export interface TreeEntry {
  name: string;
  type: EntryType;
  size: bigint;
  blobSha: string;
}

export interface CommitEntry {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorTime: bigint;
  filesChanged: number;
  additions: number;
  deletions: number;
  body: string;
  parentShas: string[];
}

export interface ChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  fromPath: string;
}

export interface ChatSession {
  id: string;
  repoId: string;
  title: string;
  createdAt: bigint;
  updatedAt: bigint;
  messageCount: number;
  pinned: boolean;
}

export interface Attachment {
  id: string;
  mimeType: string;
  filename: string;
  size: bigint;
  data: Uint8Array;
}

export interface ToolEvent {
  toolCallId: string;
  name: string;
  argsJson: string;
  resultContent: string;
  isError: boolean;
  ordinal: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: number; // MessageRole: 1=USER, 2=ASSISTANT, 3=SYSTEM
  content: string;
  model: string;
  tokenCountIn: number;
  tokenCountOut: number;
  createdAt: bigint;
  attachments: Attachment[];
  toolEvents: ToolEvent[];
}

export interface MessageChunk {
  kind:
    | { case: "token"; value: string }
    | { case: "done"; value: Done }
    | { case: "cardHit"; value: KnowledgeCardHit }
    | { case: "started"; value: Started }
    | { case: "toolCall"; value: ToolCall }
    | { case: "toolResult"; value: ToolResult }
    | { case: "thinking"; value: string }
    | { case: undefined; value?: undefined };
}

export interface Done {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  tokenCountIn: number;
  tokenCountOut: number;
  model: string;
  error: string;
}

export interface Started {
  userMessageId: string;
  sessionId: string;
  warnings: string[];
}

export interface KnowledgeCardHit {
  cardId: string;
  answerMd: string;
  model: string;
  hitCount: number;
  createdCommit: string;
}

export interface ToolCall {
  id: string;
  name: string;
  argsJson: string;
}

export interface ToolResult {
  id: string;
  content: string;
  isError: boolean;
}

export interface ConfigEntry {
  key: string;
  value: string;
  defaultValue: string;
  description: string;
  group: string;
  secret: boolean;
}

export interface LLMProfile {
  id: string;
  name: string;
  backend: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: string;
  maxTokens: string;
  systemPrompt: string;
}

export interface CatalogModel {
  id: string;
  name: string;
  contextWindow: bigint;
  costPer1mIn: number;
  costPer1mOut: number;
  canReason: boolean;
  supportsImages: boolean;
  defaultMaxTokens: bigint;
  sources: string[];
  quotes: PricingQuote[];
}

export interface PricingQuote {
  source: string;
  costPer1mIn: number;
  costPer1mOut: number;
}

export interface CatalogProvider {
  id: string;
  name: string;
  type: string;
  defaultBaseUrl: string;
  defaultModelId: string;
  models: CatalogModel[];
}

export interface LocalEndpoint {
  url: string;
  name: string;
  models: string[];
}

// ── RepoHost ─────────────────────────────────────────────────────

export interface RepoHost {
  listRepos(req: Record<string, never>): Promise<{ repos: Repo[] }>;
  listBranches(req: { repoId: string }): Promise<{ branches: Branch[]; tags: Branch[] }>;
  listCommits(req: {
    repoId: string;
    ref?: string;
    limit: number;
    offset: number;
    branch?: string;
  }): Promise<{ commits: CommitEntry[] }>;
  listTree(req: {
    repoId: string;
    ref?: string;
    path: string;
  }): Promise<{ entries: TreeEntry[]; refResolved: string }>;
  getDiff(req: {
    repoId: string;
    fromRef: string;
    toRef: string;
    path: string;
    detectRenames?: boolean;
    fromPath?: string;
    fullRange?: boolean;
    filesOnly?: boolean;
  }): Promise<{
    unifiedDiff: string;
    fromCommit: string;
    toCommit: string;
    empty: boolean;
    files: ChangedFile[];
  }>;
}

// ── ChatHost ─────────────────────────────────────────────────────

export interface ChatHost {
  listSessions(req: { repoId: string }): Promise<{ sessions: ChatSession[] }>;
  getSession(req: { sessionId: string }): Promise<{
    session: ChatSession | undefined;
    messages: ChatMessage[];
  }>;
  sendMessage(
    req: {
      sessionId: string;
      /** Empty string is allowed when the consumer has no repo
       * concept (e.g. a standalone chat). Hosts that route by repo
       * should treat empty as "default / single-tenant". */
      repoId: string;
      text: string;
      replaceFromMessageId?: string;
      attachments?: Attachment[];
    },
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<MessageChunk>;
  renameSession(req: { sessionId: string; title: string }): Promise<unknown>;
  deleteSession(req: { sessionId: string }): Promise<unknown>;
  pinSession(req: { sessionId: string; pinned: boolean }): Promise<unknown>;
  summarizeActivity(req: { repoId: string }): Promise<{ summary: string; suggestions: string[] }>;
}

// ── LlmConfigHost ────────────────────────────────────────────────

export interface LlmConfigHost {
  getConfig(req: Record<string, never>): Promise<{ entries: ConfigEntry[] }>;
  updateConfig(req: { key: string; value: string }): Promise<unknown>;
  listProfiles(req: Record<string, never>): Promise<{
    profiles: LLMProfile[];
    activeProfileId: string;
  }>;
  saveProfile(req: { profile: LLMProfile }): Promise<{ id: string }>;
  deleteProfile(req: { id: string }): Promise<unknown>;
  activateProfile(req: { id: string }): Promise<unknown>;
  getProviderCatalog(req: Record<string, never>): Promise<{ providers: CatalogProvider[] }>;
  refreshProviderCatalog(req: Record<string, never>): Promise<{ providers: CatalogProvider[] }>;
  discoverLocalEndpoints(req: Record<string, never>): Promise<{ endpoints: LocalEndpoint[] }>;
  discoverModels(req: { baseUrl: string; apiKey: string }): Promise<{
    modelIds: string[];
    providerName: string;
    error: string;
  }>;
}

// ── AuthHost ─────────────────────────────────────────────────────
//
// chatworks components do not currently consume AuthHost — it exists
// so app shells (e.g. pairing / login views shipped by consumers) can
// route auth through the same context plumbing as the rest of the
// host surface. Keeping it in the same context module means a
// consumer wires all four hosts at one point in the tree.

export interface PairedEvent {
  claimToken: string;
  principal: string;
}

export interface ExpiredEvent {
  reason: string;
}

export interface WatchPairingResponse {
  kind:
    | { case: "paired"; value: PairedEvent }
    | { case: "expired"; value: ExpiredEvent }
    | { case: undefined; value?: undefined };
}

export interface AuthHost {
  whoami(req: Record<string, never>): Promise<{ principal: string; mode: number }>;
  logout(req: Record<string, never>): Promise<unknown>;
  localClaim(req: { token: string }): Promise<{ principal: string }>;
  startPairing(req: Record<string, never>): Promise<{
    sid: string;
    code: string;
    expiresAt: bigint;
  }>;
  watchPairing(req: { sid: string }): AsyncIterable<WatchPairingResponse>;
  claim(req: { sid: string; claimToken: string }): Promise<{ principal: string }>;
}

// ── Lit context tokens ───────────────────────────────────────────
//
// Components @consume these via @lit/context; the app shell @provide's
// them on the root element. Token identity comes from a Symbol — re-
// exporting the token across packages still works because both sides
// load the same module instance (this file).

export const repoHostContext = createContext<RepoHost>(Symbol("chatworks.repoHost"));
export const chatHostContext = createContext<ChatHost>(Symbol("chatworks.chatHost"));
export const llmConfigHostContext = createContext<LlmConfigHost>(Symbol("chatworks.llmConfigHost"));
export const authHostContext = createContext<AuthHost>(Symbol("chatworks.authHost"));
