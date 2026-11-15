import {
  READER_LIMITS,
  RepositoryReadError,
  type CommitDiff,
  type CommitEntry,
  type CommitsLocation,
  type CommitsProvider,
  type ReadResult,
} from "@jpahd/commits-core/contracts";

/** Synthetic, in-memory browser fixtures. No transport, credentials or live data. */
export type CommitsFixtureState =
  | "unbound"
  | "loading"
  | "error"
  | "incompatible"
  | "empty"
  | "loaded"
  | "selected"
  | "partial"
  | "unknown"
  | "clipped"
  | "plain"
  | "detail-error";

const head = "a".repeat(40);
const parent = "b".repeat(40);
const patch =
  "diff --git a/example.ts b/example.ts\n--- a/example.ts\n+++ b/example.ts\n@@ -1 +1 @@\n-old value\n+new value\n";
const entry: CommitEntry = {
  sha: head,
  shortSha: head.slice(0, 8),
  message: "Keep repository reads bounded",
  body: "Synthetic commit body. <literal text, not markup>",
  authorName: "Example Reader",
  authorEmail: "reader@example.invalid",
  authorTime: 1_700_000_000n,
  filesChanged: 1,
  additions: 1,
  deletions: 1,
  parentShas: [parent],
};

export function createCommitsFixture(
  state: CommitsFixtureState,
  options: { clippedBy?: "lines" | "bytes" } = {},
): {
  provider?: CommitsProvider;
  location?: CommitsLocation;
} {
  if (state === "unbound") return {};
  const scope = Object.freeze({
    key: "fixture:commits",
    repositoryKey: "synthetic-repository",
    label: "Example repository",
  });
  const result = <T>(value: T): ReadResult<T> => ({ scopeKey: scope.key, value });
  const location = {
    ref: "refs/heads/main",
    ...(!["loaded", "empty", "loading", "error", "incompatible"].includes(state)
      ? { commit: head }
      : {}),
  };
  // Storybook audits a byte-clipped fixture with fewer DOM rows. The public
  // browser example retains the 4,000-line clipping fixture; no limit changes.
  const clippingLine =
    options.clippedBy === "bytes" ? `+${"synthetic source ".repeat(256)}\n` : "+example line\n";
  const clippingRows =
    options.clippedBy === "bytes"
      ? Math.ceil(READER_LIMITS.renderPatchBytes / clippingLine.length) + 10
      : READER_LIMITS.renderPatchLines + 10;
  const rawDiff =
    state === "clipped"
      ? patch + clippingLine.repeat(clippingRows)
      : state === "plain"
        ? `-${"old ".repeat(400)}\n+${"new ".repeat(400)}\n`
        : patch;
  const diff: CommitDiff = {
    toCommit: head,
    base: { kind: "commit", commit: parent },
    rawDiff,
    empty: false,
    completeness:
      state === "partial"
        ? { kind: "partial", reason: "Synthetic backend omission evidence." }
        : state === "unknown"
          ? { kind: "unknown" }
          : { kind: "complete" },
    files: [{ path: "example.ts", fromPath: "", status: "modified", additions: 1, deletions: 1 }],
  };
  const provider: CommitsProvider = {
    scope,
    describe: async () => result({ initialRef: location.ref }),
    listRefs: async (signal) => {
      signal.throwIfAborted();
      if (state === "loading") {
        // Deliberately held until cancellation; the reader still enforces its normal deadline.
        await new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
      if (state === "error") throw new Error("Synthetic backend detail must not be rendered.");
      if (state === "incompatible") throw new RepositoryReadError("incompatible");
      return result([{ name: "main", selector: location.ref, kind: "branch" }]);
    },
    resolve: async (ref) => result({ requestedRef: ref, commit: head }),
    list: async () =>
      result({
        commits: state === "empty" ? [] : [{ ...entry, parentShas: [...entry.parentShas] }],
        hasMore: false,
      }),
    commit: async () => result({ ...entry, parentShas: [...entry.parentShas] }),
    diff: async () => {
      if (state === "detail-error") throw new Error("Synthetic private detail failure.");
      return result(diff);
    },
  };
  return { provider, location };
}
