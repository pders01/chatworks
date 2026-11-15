// Browser fixture consumes the public compiled package export, without aliases.
import * as ui from "@jpahd/chatworks/repository-ui";

const scope = Object.freeze({ repositoryId: "fixture-repository", ref: "snapshot-001" });
const paths = ["README.md", "src/index.ts", "src/components/reader.ts", "tests/reader.test.ts"];
const source =
  "// Synthetic source: no repository or private data read.\nexport const greeting = '<literal markup>';\nexport function hello(name: string) {\n  return `${greeting} ${name}`;\n}\n";
const tabs = document.querySelector("cw-file-tabs");
tabs.tabs = paths.map((path) => ({
  id: `${scope.ref}:${path}`,
  label: path.split("/").at(-1),
  description: path,
}));
tabs.activeId = tabs.tabs[0].id;
const picker = document.querySelector("cw-file-picker");
picker.scope = scope;
picker.client = {
  search: async (requested, query) => ({
    ref: requested.ref,
    paths: paths.filter((path) => path.toLowerCase().includes(query.toLowerCase())),
    truncated: false,
    incomplete: false,
  }),
};
const previewClient = {
  preview: async (file) => ({
    ref: file.ref,
    path: file.path,
    content: source,
    binary: false,
    truncated: true,
    size: 4096,
    language: "typescript",
  }),
};
const controller = new ui.SourcePreviewController(previewClient);
const preview = document.querySelector("cw-source-preview");
preview.controller = controller;
await controller.open("reader", { ...scope, path: "src/index.ts" });
const tree = document.querySelector("cw-repository-tree");
tree.scope = scope;
tree.client = {
  children: async (requested, path) => ({
    ref: requested.ref,
    truncated: false,
    incomplete: false,
    entries:
      path === ""
        ? [
            { path: "src", name: "src", kind: "directory" },
            { path: "README.md", name: "README.md", kind: "file" },
          ]
        : path === "src"
          ? [
              { path: "src/components", name: "components", kind: "directory" },
              { path: "src/index.ts", name: "index.ts", kind: "file" },
            ]
          : [{ path: "src/components/reader.ts", name: "reader.ts", kind: "file" }],
  }),
};
document.querySelector("#find").addEventListener("click", () => {
  picker.open = true;
});
document.addEventListener("cw:file-open", (event) => {
  // Intentionally only reports intent; a host decides whether/how to open a source.
  document.querySelector("#intent").textContent = JSON.stringify(event.detail);
});
preview.addEventListener("cw:source-preview-close", () => controller.close());
window.fixture = {
  ui,
  scope,
  paths,
  source,
  tabs,
  picker,
  controller,
  preview,
  tree,
  previewClient,
};
window.fixtureReady = true;
