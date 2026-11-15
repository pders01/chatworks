import { provide } from "@lit/context";
import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
  EntryType,
  authHostContext,
  chatHostContext,
  llmConfigHostContext,
  repoHostContext,
  type AuthHost,
  type CatalogProvider,
  type ChatHost,
  type ChatMessage,
  type ChatSession,
  type LlmConfigHost,
  type RepoHost,
} from "@jpahd/chatworks/host";
import { MessageRole } from "@jpahd/chatworks/chat-types";

export const storySessions: ChatSession[] = [
  {
    id: "session-design",
    repoId: "storybook",
    title: "Plan a community garden",
    createdAt: 1_725_000_000n,
    updatedAt: 1_725_400_000n,
    messageCount: 4,
    pinned: true,
  },
  {
    id: "session-review",
    repoId: "storybook",
    title: "Review planting notes",
    createdAt: 1_724_000_000n,
    updatedAt: 1_724_800_000n,
    messageCount: 9,
    pinned: false,
  },
  {
    id: "session-tests",
    repoId: "storybook",
    title: "Schedule the watering rota",
    createdAt: 1_723_000_000n,
    updatedAt: 1_723_900_000n,
    messageCount: 6,
    pinned: false,
  },
];

export const storyMessages: ChatMessage[] = [
  {
    id: "message-user-1",
    sessionId: "session-design",
    role: MessageRole.USER,
    content: "How can we organize planting tasks for a small community garden?",
    model: "",
    tokenCountIn: 0,
    tokenCountOut: 0,
    createdAt: 1_725_000_001n,
    attachments: [],
    toolEvents: [],
  },
  {
    id: "message-assistant-1",
    sessionId: "session-design",
    role: MessageRole.ASSISTANT,
    content:
      "Group tasks by planting bed and season. Keep watering and harvest dates visible, and assign one volunteer to each recurring task.",
    model: "claude-sonnet-4",
    tokenCountIn: 612,
    tokenCountOut: 184,
    createdAt: 1_725_000_002n,
    attachments: [],
    toolEvents: [
      {
        toolCallId: "tool-read",
        name: "read",
        argsJson: '{"path":"docs/garden-plan.md"}',
        resultContent: "Loaded synthetic garden plan",
        isError: false,
        ordinal: 0,
      },
    ],
  },
];

const catalog: CatalogProvider[] = [
  {
    id: "local",
    name: "Local models",
    type: "openai",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    defaultModelId: "qwen3-coder",
    models: [
      {
        id: "qwen3-coder",
        name: "Qwen 3 Coder",
        contextWindow: 131_072n,
        costPer1mIn: 0,
        costPer1mOut: 0,
        canReason: true,
        supportsImages: false,
        defaultMaxTokens: 8_192n,
        sources: ["local"],
        quotes: [{ source: "local", costPer1mIn: 0, costPer1mOut: 0 }],
      },
    ],
  },
];

export function createStoryChatHost(options: { sessions?: ChatSession[] } = {}): ChatHost {
  let sessions = [...(options.sessions ?? storySessions)];
  return {
    async listSessions() {
      return { sessions: [...sessions] };
    },
    async getSession({ sessionId }) {
      return {
        session: sessions.find((session) => session.id === sessionId),
        messages: sessionId === "session-design" ? storyMessages : [],
      };
    },
    async *sendMessage({ sessionId, text }, { signal } = {}) {
      const id = sessionId || "session-new";
      if (!sessionId) {
        sessions = [
          {
            id,
            repoId: "storybook",
            title: text.slice(0, 42) || "New session",
            createdAt: BigInt(Date.now()),
            updatedAt: BigInt(Date.now()),
            messageCount: 2,
            pinned: false,
          },
          ...sessions,
        ];
      }
      yield {
        kind: {
          case: "started",
          value: { userMessageId: "story-user", sessionId: id, warnings: [] },
        },
      };
      yield { kind: { case: "thinking", value: "Grouping the planting tasks by season…" } };
      await pause(180, signal);
      yield {
        kind: {
          case: "toolCall",
          value: { id: "story-tool", name: "inspect_workflow", argsJson: '{"scope":"project"}' },
        },
      };
      await pause(180, signal);
      yield {
        kind: {
          case: "toolResult",
          value: {
            id: "story-tool",
            content: "Found three planting beds and a weekly watering rota",
            isError: false,
          },
        },
      };
      for (const token of [
        "Plant leafy greens in the first bed, ",
        "herbs in the second, and keep ",
        "a shared watering rota for volunteers.",
      ]) {
        await pause(120, signal);
        yield { kind: { case: "token", value: token } };
      }
      yield {
        kind: {
          case: "done",
          value: {
            sessionId: id,
            userMessageId: "story-user",
            assistantMessageId: "story-assistant",
            tokenCountIn: 84,
            tokenCountOut: 31,
            model: "qwen3-coder",
            error: "",
          },
        },
      };
    },
    async renameSession({ sessionId, title }) {
      sessions = sessions.map((session) =>
        session.id === sessionId ? { ...session, title } : session,
      );
    },
    async deleteSession({ sessionId }) {
      sessions = sessions.filter((session) => session.id !== sessionId);
    },
    async pinSession({ sessionId, pinned }) {
      sessions = sessions.map((session) =>
        session.id === sessionId ? { ...session, pinned } : session,
      );
    },
    async summarizeActivity() {
      return {
        summary: "The garden plan covers **planting**, watering, and volunteer handovers.",
        suggestions: ["Review the planting plan", "Draft a watering rota"],
      };
    },
  };
}

export function createStoryRepoHost(): RepoHost {
  return {
    async listRepos() {
      return {
        repos: [
          {
            id: "storybook",
            label: "community-garden",
            defaultBranch: "main",
            headCommit: "ddab30b",
          },
        ],
      };
    },
    async listBranches() {
      return { branches: [], tags: [] };
    },
    async listCommits() {
      return {
        commits: [
          {
            sha: "ddab30ba81d8",
            shortSha: "ddab30b",
            message: "Add a seasonal planting plan",
            authorName: "Example Volunteer",
            authorEmail: "story@example.test",
            authorTime: 1_725_000_000n,
            filesChanged: 11,
            additions: 1_522,
            deletions: 11,
            body: "",
            parentShas: ["323321e"],
          },
        ],
        hasMore: false,
      };
    },
    async listTree({ path }) {
      const entries = path
        ? [
            { name: "plant.ts", type: EntryType.FILE, size: 180n, blobSha: "story" },
            { name: "water.ts", type: EntryType.FILE, size: 120n, blobSha: "story" },
          ]
        : [
            { name: "src", type: EntryType.DIR, size: 0n, blobSha: "" },
            { name: "README.md", type: EntryType.FILE, size: 5_600n, blobSha: "story" },
          ];
      return { entries, refResolved: "main" };
    },
    async getFilePreview({ path }) {
      const content = path.endsWith("plant.ts")
        ? `export interface PlantingBed {
  name: string;
  crop: string;
  season: "spring" | "summer";
}

export const beds: PlantingBed[] = [
  { name: "North", crop: "lettuce", season: "spring" },
  { name: "South", crop: "basil", season: "summer" },
];
`
        : `export function needsWater(lastWatered: number, now: number): boolean {
  const day = 24 * 60 * 60 * 1000;
  return now - lastWatered >= day;
}
`;
      return {
        path,
        content,
        size: BigInt(new TextEncoder().encode(content).length),
        binary: false,
        truncated: false,
        language: "typescript",
      };
    },
    async getBlame() {
      return {
        lines: [
          {
            lineNumber: 1,
            text: "export interface PlantingBed {",
            authorName: "Example Volunteer",
            authorEmail: "story@example.test",
            authorTime: 1_725_000_000n,
            sha: "ddab30ba81d8cafe000000000000000000000000",
            shortSha: "ddab30b",
            message: "Add a seasonal planting plan",
          },
        ],
      };
    },
    async getDiff() {
      return {
        unifiedDiff: "",
        fromCommit: "323321e",
        toCommit: "ddab30b",
        empty: true,
        files: [],
      };
    },
  };
}

export function createStoryLlmConfigHost(): LlmConfigHost {
  return {
    async getConfig() {
      return {
        entries: [
          configEntry("LLM_BACKEND", "openai", "Provider protocol"),
          configEntry("LLM_BASE_URL", "http://127.0.0.1:11434/v1", "Provider endpoint"),
          configEntry("LLM_MODEL", "qwen3-coder", "Active model"),
          { ...configEntry("LLM_API_KEY", "", "Optional API key"), secret: true },
        ],
      };
    },
    async updateConfig() {},
    async listProfiles() {
      return { profiles: [], activeProfileId: "" };
    },
    async saveProfile({ profile }) {
      return { id: profile.id || "story-profile" };
    },
    async deleteProfile() {},
    async activateProfile() {},
    async getProviderCatalog() {
      return { providers: catalog };
    },
    async refreshProviderCatalog() {
      return { providers: catalog };
    },
    async discoverLocalEndpoints() {
      return {
        endpoints: [{ url: "http://127.0.0.1:11434/v1", name: "Local", models: ["qwen3-coder"] }],
      };
    },
    async discoverModels() {
      return { modelIds: ["qwen3-coder"], providerName: "Local", error: "" };
    },
  };
}

const storyAuthHost: AuthHost = {
  async whoami() {
    return { principal: "storybook", mode: 1 };
  },
  async logout() {},
  async localClaim() {
    return { principal: "storybook" };
  },
  async startPairing() {
    return { sid: "story", code: "CW-1234", expiresAt: BigInt(Date.now() + 60_000) };
  },
  async *watchPairing() {
    yield { kind: { case: "expired", value: { reason: "Story finished" } } };
  },
  async claim() {
    return { principal: "storybook" };
  },
};

@customElement("cw-story-host")
export class CwStoryHost extends LitElement {
  @provide({ context: chatHostContext })
  @property({ attribute: false })
  chatHost: ChatHost = createStoryChatHost();

  @provide({ context: repoHostContext })
  @property({ attribute: false })
  repoHost: RepoHost = createStoryRepoHost();

  @provide({ context: llmConfigHostContext })
  @property({ attribute: false })
  llmConfigHost: LlmConfigHost = createStoryLlmConfigHost();

  @provide({ context: authHostContext })
  @property({ attribute: false })
  authHost: AuthHost = storyAuthHost;

  override render() {
    return html`<slot></slot>`;
  }

  static override styles = css`
    :host {
      display: contents;
    }
  `;
}

function configEntry(key: string, value: string, description: string) {
  return { key, value, defaultValue: value, description, group: "story", secret: false };
}

async function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-story-host": CwStoryHost;
  }
}
