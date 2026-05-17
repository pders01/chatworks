// Connect-RPC adapter — the default backend for chatworks's host
// interfaces. Builds a transport (or reuses one) and returns a
// `{ repoHost, chatHost, llmConfigHost, authHost }` bundle that the
// app shell provides via @lit/context.
//
// The chatworks components do not import from this file — they only
// see the host interfaces in src/host.ts. Internal rule (enforced by
// review, not the type system): src/components/* MUST NOT import from
// src/adapters/* or src/gen/*. That keeps the components transport-
// agnostic and lets a consumer swap in a non-RPC implementation
// without touching them.

import { createClient, type Transport } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "../gen/gitchat/v1/auth_pb.js";
import { RepoService } from "../gen/gitchat/v1/repo_pb.js";
import { ChatService } from "../gen/gitchat/v1/chat_pb.js";
import type { AuthHost, ChatHost, LlmConfigHost, RepoHost } from "../host.js";

export interface CreateConnectRpcHostsOptions {
  /** Base URL for the Connect transport. Defaults to "/" (same origin). */
  baseUrl?: string;
  /** Override the transport directly — escape hatch for tests or
   *  consumers who want their own interceptors. */
  transport?: Transport;
}

export interface ConnectRpcHosts {
  repoHost: RepoHost;
  chatHost: ChatHost;
  llmConfigHost: LlmConfigHost;
  authHost: AuthHost;
}

/**
 * Build the default Connect-RPC-backed hosts. With no options, hits
 * same-origin endpoints with cookies included. `credentials: "include"`
 * is essential: without it the browser drops the session cookie on
 * Connect calls, and every Whoami after Claim would return empty.
 */
export function createConnectRpcHosts(opts: CreateConnectRpcHostsOptions = {}): ConnectRpcHosts {
  const transport =
    opts.transport ??
    createConnectTransport({
      baseUrl: opts.baseUrl ?? "/",
      useBinaryFormat: false,
      fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, credentials: "include" })) as typeof fetch,
    });

  const authClient = createClient(AuthService, transport);
  const repoClient = createClient(RepoService, transport);
  const chatClient = createClient(ChatService, transport);

  // The Connect-generated clients are structurally compatible with the
  // host interfaces — same method names, same request/response shapes.
  // Casting is safe here because the proto types are a superset (they
  // carry $typeName / Message symbols the host interfaces don't care
  // about) and TS structural width-subtyping accepts the assignment.
  return {
    repoHost: repoClient as unknown as RepoHost,
    chatHost: chatClient as unknown as ChatHost,
    llmConfigHost: repoClient as unknown as LlmConfigHost,
    authHost: authClient as unknown as AuthHost,
  };
}
