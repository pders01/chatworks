// Public entry. Side-effect imports register the custom elements; named
// re-exports surface the host contracts and shared helpers a consumer
// typically wires up at boot.
//
// The primary integration path is host injection: build hosts with
// `createConnectRpcHosts()` (or your own implementation of the host
// interfaces) and `@provide` them on a root element via @lit/context.
// The components @consume them automatically. Importing transport
// clients directly is still possible via the "/transport" subpath
// export, but it bypasses the seam the components are built around
// and is no longer the recommended path.

// ── Custom-element registrations ─────────────────────────────────
import "./components/toast.js";
import "./components/loading-indicator.js";
import "./components/combobox.js";
import "./components/connection-wizard.js";
import "./components/chat-view.js";
import "./components/diff-view.js";
import "./components/settings-panel.js";
import "./components/workbench-view.js";
import "./components/workbench-switcher.js";
import "./components/command-palette.js";

// ── Event-map augmentations ──────────────────────────────────────
import "./lib/events.js";

// ── Host contract + default adapter ──────────────────────────────
export * from "./host.js";
export { createConnectRpcHosts, type ConnectRpcHosts } from "./adapters/connect-rpc.js";

// ── Runtime helpers ──────────────────────────────────────────────
export * as settings from "./lib/settings.js";
export {
  DisposableStore,
  WorkbenchExtensionHost,
  WorkbenchRegistry,
  WorkbenchServiceCollection,
  WorkbenchStorage,
  asDisposable,
  customElementView,
  extensionFromModule,
  toDisposable,
  type Disposable,
  type DisposableLike,
  type WorkbenchCommand,
  type WorkbenchCommandContext,
  type WorkbenchContextValue,
  type WorkbenchContribution,
  type WorkbenchExtension,
  type WorkbenchExtensionContext,
  type WorkbenchExtensionModule,
  type WorkbenchPredicate,
  type WorkbenchView,
  type WorkbenchViewContext,
} from "./lib/workbench.js";
export {
  readFocus,
  writeFocus,
  cycleFocus,
  focusButtonLabel,
  focusGlyph,
  focusNextLabel,
  type FocusMode,
} from "./lib/focus.js";
export { copyText } from "./lib/clipboard.js";
export {
  parseUnifiedDiff,
  extractDiffLineHtml,
  splitDiffHtml,
  highlightWordDiffs,
  addLineNumbers,
  type DiffLineKind,
  type ParsedDiff,
  type ParsedDiffFile,
  type ParsedDiffHunk,
  type ParsedDiffLine,
} from "./lib/diff.js";
export { toast } from "./components/toast.js";

// ── Public types (event payloads) ────────────────────────────────
export type * from "./lib/events.js";
