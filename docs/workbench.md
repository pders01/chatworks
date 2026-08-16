# Workbench and extension contract

Chatworks provides an unopinionated workbench runtime for composing AI-assisted
productivity surfaces. It supplies registration, lifecycle, commands, services,
context, persistence, and view-mounting primitives; it does **not** prescribe a
canvas, board, editor, task model, router, or backend.

The host owns the shell and the capabilities. Extensions contribute views and
commands, or publish values to host-defined contribution points. A view can mount
any custom element or framework into the provided element, so a kanban board,
canvas, issue triage view, or document editor does not have to pretend to be a
chat message.

## Create a host

```ts
import {
  WorkbenchExtensionHost,
  WorkbenchRegistry,
} from "@jpahd/chatworks/workbench";
import "@jpahd/chatworks/workbench-view";
import "@jpahd/chatworks/workbench-switcher";
import "@jpahd/chatworks/command-palette";

const registry = new WorkbenchRegistry();
const extensions = new WorkbenchExtensionHost(registry);

registry.services.provide("acme.assistant", assistantService);
registry.services.provide("acme.documents", documentService);
registry.setContext("acme.workspaceOpen", true);

await extensions.activate(myExtension);
```

The rendering pieces are deliberately independent:

```html
<cw-workbench-switcher></cw-workbench-switcher>
<cw-workbench-view></cw-workbench-view>
<cw-command-palette></cw-command-palette>
```

Set each component's `registry` property. Set `viewId` on
`cw-workbench-view`; listen for `cw:view-selected`, or read
`registry.activeView(region)`, when the host controls routing. The palette is
opened with its `show()` method, leaving shortcut policy to the embedding app.

## Author an extension

An extension is a plain JavaScript object. The activation context owns everything
registered through it and removes those registrations when the extension is
deactivated.

```js
export const id = "example.kanban";
export const name = "Example board";

export function activate(context) {
  context.registerView({
    id: "example.kanban.board",
    title: "Board",
    icon: "▦",
    region: "primary",
    mount(container) {
      const board = document.createElement("example-kanban");
      board.columns = context.storage.get("columns", ["Backlog", "Doing", "Done"]);
      board.assistant = context.services.get("acme.assistant");
      container.append(board);

      const save = (event) => context.storage.set("columns", event.detail.columns);
      board.addEventListener("columns-changed", save);
      return () => board.removeEventListener("columns-changed", save);
    },
  });

  context.registerCommand({
    id: "example.kanban.open",
    title: "Open board",
    category: "Board",
    run() {
      context.openView("example.kanban.board");
    },
  });

  // Host-defined extension point: Chatworks stores and orders the values but
  // does not impose their schema or render them.
  context.contribute("acme.project-actions", {
    id: "example.kanban.create-card",
    value: { label: "Create card", command: "example.kanban.create-card" },
  });
}
```

Extension modules may instead default-export a `WorkbenchExtension` object.
`extensionFromModule()` normalizes either form for loaders.

## Contract

### Views

A `WorkbenchView` has a stable `id`, title, optional region/order/icon/description,
and a `mount(container, context)` function. Mount may be async and may return a
`Disposable` or cleanup function. `cw-workbench-view` guarantees cleanup when the
view changes, disappears, fails activation, or disconnects. Async mounts that
finish after navigation are immediately disposed.

Use a custom element as the normal view boundary. `customElementView()` is a
small helper for this case. Extensions may use another renderer internally, but
they own its dependencies, DOM, and teardown.

### Commands

Commands have a stable ID and async-capable `run()` function. Invoke them through
`registry.executeCommand()` so availability and extension ownership remain
consistent. The command palette searches titles, categories, descriptions, and
IDs.

### Services

`WorkbenchServiceCollection` is the host capability boundary. Service IDs and
interfaces belong to the embedding product. Extensions should feature-detect
optional capabilities with `services.tryGet()` and use `services.get()` only for
required capabilities. Services are not a security boundary: loaded extension
code has the same browser authority as the host page.

### Context and visibility

Views, commands, and contributions can define a `when(context)` predicate. Hosts
update primitive context values with `registry.setContext()`. Predicates are
reevaluated for reads and registry changes; a hidden active view is closed.

### Contributions

`registry.contribute(point, contribution)` supports arbitrary host-owned
extension points without growing Chatworks around every workflow concept. A host
might define points for inspectors, entity actions, assistant context providers,
canvas tools, card renderers, or status items. The host publishes the schema and
renders `registry.contributions(point)`.

### State and lifecycle

`context.storage` is JSON storage namespaced by extension ID. It persists through
`localStorage` when available and falls back to memory when storage is blocked.
Extension registrations and the activation return value are disposed in reverse
order. `deactivate()` runs after those resources are released.

## Design rules

- Keep domain data and backend calls in host services, not global singletons.
- Pass data into custom elements through properties and report user intent with
  composed DOM events.
- Treat extension IDs, view IDs, command IDs, and contribution IDs as durable API.
- Do not put complete workflow state in a contribution descriptor; contribute a
  renderer/action and keep state in its owning service.
- Load only trusted extension code. An extension can access the page, storage,
  network, and every service supplied to it.
