/**
 * Compatibility entry point for existing Chatworks imports, including
 * @jpahd/chatworks/proto/chat. All original types, messages, enums, and service
 * descriptors are reexported without wrapping or creating new descriptor objects.
 *
 * Canonical generated TypeScript now lives in @jpahd/git-chat-protocol/chat;
 * the schema source of truth remains git-chat/proto/gitchat/v1/chat.proto.
 * Do not regenerate into this file. See git-chat-protocol/docs/GENERATION.md
 * for pinned generator provenance and the reviewed sync procedure.
 */
export * from "@jpahd/git-chat-protocol/chat";
