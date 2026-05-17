// Public entry. Side-effect imports register the custom elements; named
// re-exports surface the runtime singletons and shared helpers a host
// shell typically wires up at boot.

// ── Custom-element registrations ─────────────────────────────────
import "./components/toast.js";
import "./components/loading-indicator.js";
import "./components/combobox.js";
import "./components/connection-wizard.js";
import "./components/chat-view.js";
import "./components/settings-panel.js";

// ── Event-map augmentations ──────────────────────────────────────
import "./lib/events.js";

// ── Runtime singletons + helpers ─────────────────────────────────
export { authClient, chatClient, repoClient } from "./lib/transport.js";
export * as settings from "./lib/settings.js";
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
export { toast } from "./components/toast.js";

// ── Public types (event payloads) ────────────────────────────────
export type * from "./lib/events.js";
