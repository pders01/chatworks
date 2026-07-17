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

  // Keep generated clients behind explicit Host implementations. This
  // makes the adapter the single place that knows which RPC service owns
  // each host operation, while `satisfies` catches contract drift without
  // exposing generated client types to consumers.
  const repoHost = {
    listRepos: (req) => repoClient.listRepos(req),
    listBranches: (req) => repoClient.listBranches(req),
    listCommits: (req) => repoClient.listCommits(req),
    listTree: (req) => repoClient.listTree(req),
    getDiff: (req) => repoClient.getDiff(req),
  } satisfies RepoHost;

  const chatHost = {
    listSessions: (req) => chatClient.listSessions(req),
    getSession: async (req) => {
      const response = await chatClient.getSession(req);
      return { session: response.session, messages: response.messages };
    },
    sendMessage: (req, opts) => chatClient.sendMessage(req, opts),
    renameSession: (req) => chatClient.renameSession(req),
    deleteSession: (req) => chatClient.deleteSession(req),
    pinSession: (req) => chatClient.pinSession(req),
    summarizeActivity: (req) => chatClient.summarizeActivity(req),
  } satisfies ChatHost;

  // The current wire contract serves LLM configuration through RepoService.
  // That backend-specific grouping belongs here, not in components or hosts.
  const llmConfigHost = {
    getConfig: (req) => repoClient.getConfig(req),
    updateConfig: (req) => repoClient.updateConfig(req),
    listProfiles: (req) => repoClient.listProfiles(req),
    saveProfile: (req) => repoClient.saveProfile(req),
    deleteProfile: (req) => repoClient.deleteProfile(req),
    activateProfile: (req) => repoClient.activateProfile(req),
    getProviderCatalog: (req) => repoClient.getProviderCatalog(req),
    refreshProviderCatalog: (req) => repoClient.refreshProviderCatalog(req),
    discoverLocalEndpoints: (req) => repoClient.discoverLocalEndpoints(req),
    discoverModels: (req) => repoClient.discoverModels(req),
  } satisfies LlmConfigHost;

  const authHost = {
    whoami: (req) => authClient.whoami(req),
    logout: (req) => authClient.logout(req),
    localClaim: (req) => authClient.localClaim(req),
    startPairing: (req) => authClient.startPairing(req),
    watchPairing: (req) => authClient.watchPairing(req),
    claim: (req) => authClient.claim(req),
  } satisfies AuthHost;

  return { repoHost, chatHost, llmConfigHost, authHost };
}
