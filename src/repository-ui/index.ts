/** Transport-free repository browser primitives; no Pi runtime, routes or backend. */
export type {
  RepositoryScope,
  FileIdentity,
  FileSearchResult,
  FileSearchClient,
  SourcePreview,
  SourcePreviewClient,
  RepositoryEntry,
  RepositoryTreeResult,
  RepositoryTreeClient,
} from "./contracts.js";
export { CwFileTabs, type FileTabsChange } from "./file-tabs.js";
export type { FileTab } from "./file-tabs-template.js";
export { FileTabDragController, reorderFileTabs } from "./file-tab-drag-controller.js";
export { CwFilePicker, FILE_PICKER_LIMIT, FILE_PICKER_DEBOUNCE_MS } from "./file-picker.js";
export {
  SourcePreviewController,
  SOURCE_PREVIEW_MAX_BYTES,
  SOURCE_PREVIEW_MAX_CHARS,
  SOURCE_PREVIEW_MAX_SURFACES,
  type SourcePreviewState,
} from "./source-preview-controller.js";
export { CwSourcePreview } from "./source-preview.js";
export {
  CwRepositoryTree,
  REPOSITORY_TREE_CHILD_LIMIT,
  REPOSITORY_TREE_ROW_LIMIT,
  REPOSITORY_TREE_DEPTH_LIMIT,
} from "./repository-tree.js";

import type { FileIdentity } from "./contracts.js";
import type { FileTabsChange } from "./file-tabs.js";

declare global {
  interface HTMLElementEventMap {
    "cw:file-open": CustomEvent<FileIdentity>;
    "cw:file-tabs-change": CustomEvent<FileTabsChange>;
    "cw:file-picker-close": CustomEvent<undefined>;
    "cw:source-preview-close": CustomEvent<FileIdentity>;
  }
}
