// Constructor helpers for MessageChunk. Hand-building the nested
// `{ kind: { case, value } }` discriminated-union shape that bufbuild
// codegen produces is awkward in from-scratch ChatHost implementations.
// These thin wrappers make sendMessage bodies readable.

import type {
  Done,
  KnowledgeCardHit,
  MessageChunk,
  Started,
  ToolCall,
  ToolResult,
} from "../host.js";

export const chunk = {
  token: (value: string): MessageChunk => ({
    kind: { case: "token", value },
  }),
  thinking: (value: string): MessageChunk => ({
    kind: { case: "thinking", value },
  }),
  started: (value: Started): MessageChunk => ({
    kind: { case: "started", value },
  }),
  done: (value: Done): MessageChunk => ({
    kind: { case: "done", value },
  }),
  cardHit: (value: KnowledgeCardHit): MessageChunk => ({
    kind: { case: "cardHit", value },
  }),
  toolCall: (value: ToolCall): MessageChunk => ({
    kind: { case: "toolCall", value },
  }),
  toolResult: (value: ToolResult): MessageChunk => ({
    kind: { case: "toolResult", value },
  }),
};
