import { describe, expect, test } from "bun:test";
import { createRouterTransport } from "@connectrpc/connect";
import { RepoService } from "../gen/gitchat/v1/repo_pb.js";
import { createConnectRpcHosts } from "./connect-rpc.js";

describe("Connect-RPC host adapter", () => {
  test("maps commit path filters and pagination metadata", async () => {
    let received:
      | { repoId: string; ref: string; limit: number; offset: number; path: string }
      | undefined;
    const transport = createRouterTransport((router) => {
      router.service(RepoService, {
        listCommits(request) {
          received = request;
          return { commits: [], hasMore: true };
        },
      });
    });
    const { repoHost } = createConnectRpcHosts({ transport });

    const response = await repoHost.listCommits({
      repoId: "chatworks",
      ref: "main",
      path: "src/host.ts",
      limit: 20,
      offset: 40,
      branch: "legacy-ignored",
    });

    expect(received).toMatchObject({
      repoId: "chatworks",
      ref: "main",
      path: "src/host.ts",
      limit: 20,
      offset: 40,
    });
    expect(received).not.toHaveProperty("branch");
    expect(response).toEqual({ commits: [], hasMore: true });
  });

  test("normalizes blame lines independently of protobuf shapes", async () => {
    let received: { repoId: string; ref: string; path: string } | undefined;
    const fullSha = "0123456789abcdef0123456789abcdef01234567";
    const transport = createRouterTransport((router) => {
      router.service(RepoService, {
        getBlame(request) {
          received = request;
          return {
            lines: [
              {
                text: "first line",
                authorName: "Ada",
                authorEmail: "ada@example.test",
                date: 1_700_000_000n,
                commitSha: "abc1234",
                commitMessage: "Initial version",
              },
              {
                text: "second line",
                authorName: "Grace",
                authorEmail: "grace@example.test",
                date: 1_700_000_100n,
                commitSha: fullSha,
                commitMessage: "Refine version",
              },
            ],
          };
        },
      });
    });
    const { repoHost } = createConnectRpcHosts({ transport });

    const response = await repoHost.getBlame!({
      repoId: "chatworks",
      ref: "main",
      path: "src/host.ts",
    });

    expect(received).toMatchObject({ repoId: "chatworks", ref: "main", path: "src/host.ts" });
    expect(response).toEqual({
      lines: [
        {
          lineNumber: 1,
          text: "first line",
          authorName: "Ada",
          authorEmail: "ada@example.test",
          authorTime: 1_700_000_000n,
          sha: undefined,
          shortSha: "abc1234",
          message: "Initial version",
        },
        {
          lineNumber: 2,
          text: "second line",
          authorName: "Grace",
          authorEmail: "grace@example.test",
          authorTime: 1_700_000_100n,
          sha: fullSha,
          shortSha: "0123456",
          message: "Refine version",
        },
      ],
    });
  });
});
