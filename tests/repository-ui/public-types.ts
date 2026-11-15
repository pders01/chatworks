// Compile-only consumer of emitted declarations, independent of root export wiring.
import {
  CwFileTabs,
  CwFilePicker,
  CwRepositoryTree,
  CwSourcePreview,
  SourcePreviewController,
  type FileIdentity,
  type FileSearchClient,
  type RepositoryScope,
  type RepositoryTreeClient,
  type SourcePreviewClient,
} from "@jpahd/chatworks/repository-ui";

const scope: RepositoryScope = { repositoryId: "fixture", ref: "immutable-fixture" };
const search: FileSearchClient = {
  async search(request, query, options) {
    options.signal.throwIfAborted();
    return {
      ref: request.ref,
      paths: [query].slice(0, options.limit),
      truncated: false,
      incomplete: false,
    };
  },
};
const source: SourcePreviewClient = {
  async preview(file, options) {
    options.signal.throwIfAborted();
    return {
      ref: file.ref,
      path: file.path,
      content: "source".slice(0, options.maxBytes),
      binary: false,
      truncated: false,
    };
  },
};
const children: RepositoryTreeClient = {
  async children(request, _path, options) {
    options.signal.throwIfAborted();
    return { ref: request.ref, entries: [], truncated: false, incomplete: false };
  },
};
const file: FileIdentity = { ...scope, path: "fixture.txt" };
const controller = new SourcePreviewController(source);
const tabs = new CwFileTabs();
tabs.addEventListener("cw:file-tabs-change", (event) => {
  tabs.tabs = event.detail.tabs;
});
const picker = new CwFilePicker();
picker.client = search;
picker.scope = scope;
picker.addEventListener("cw:file-open", (event) => {
  void controller.open("reader", event.detail);
});
const tree = new CwRepositoryTree();
tree.client = children;
tree.scope = scope;
const view = new CwSourcePreview();
view.controller = controller;
void controller.open("fixture", file);
