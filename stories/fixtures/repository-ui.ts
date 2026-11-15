import type {
  FileSearchClient,
  RepositoryScope,
  RepositoryTreeClient,
  SourcePreviewClient,
} from "@jpahd/chatworks/repository-ui";

export type ReadState = "loaded" | "unbound" | "loading" | "empty" | "error" | "bounded";
export const scope: RepositoryScope = Object.freeze({
  repositoryId: "synthetic-garden",
  ref: "snapshot-001",
});
export const paths = ["README.md", "src/plant.ts", "src/water.ts", "tests/plant.test.ts"];
export const source = "// Synthetic source only.\nexport const plant = '<seedling>';\n";

async function held(signal: AbortSignal): Promise<never> {
  signal.throwIfAborted();
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}
async function beforeRead(state: ReadState, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (state === "loading") await held(signal);
  if (state === "error") throw new Error("Synthetic snapshot unavailable. Retry the read.");
}

export function searchClient(state: ReadState): FileSearchClient {
  return {
    async search(requested, query, { signal }) {
      await beforeRead(state, signal);
      return {
        ref: requested.ref,
        paths: state === "empty" ? [] : paths.filter((path) => path.includes(query)),
        truncated: state === "bounded",
        incomplete: state === "bounded",
      };
    },
  };
}
export function treeClient(state: ReadState): RepositoryTreeClient {
  return {
    async children(requested, path, { signal }) {
      await beforeRead(state, signal);
      return {
        ref: requested.ref,
        truncated: state === "bounded",
        incomplete: state === "bounded",
        entries:
          state === "empty"
            ? []
            : path === ""
              ? [
                  { path: "src", name: "src", kind: "directory" },
                  { path: "README.md", name: "README.md", kind: "file" },
                ]
              : [
                  { path: "src/plant.ts", name: "plant.ts", kind: "file" },
                  { path: "src/water.ts", name: "water.ts", kind: "file" },
                ],
      };
    },
  };
}
export function previewClient(state: ReadState | "binary"): SourcePreviewClient {
  return {
    async preview(file, { maxBytes, signal }) {
      await beforeRead(state === "binary" ? "loaded" : state, signal);
      // The client honors the request budget before returning. Bounded evidence
      // uses a short prefix, not a huge DOM fixture or an altered production limit.
      const content = state === "empty" || state === "binary" ? "" : source.slice(0, maxBytes);
      return {
        ref: file.ref,
        path: file.path,
        content,
        binary: state === "binary",
        truncated: state === "bounded",
        size: state === "bounded" ? 4096 : content.length,
        language: "typescript",
      };
    },
  };
}
