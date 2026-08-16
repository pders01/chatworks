import { describe, expect, test } from "bun:test";
import { WorkbenchRegistry } from "../lib/workbench.js";
import { CwWorkbenchView } from "./workbench-view.js";

describe("cw-workbench-view", () => {
  test("mounts once across unrelated context updates and disposes on disconnect", async () => {
    const registry = new WorkbenchRegistry();
    let mounts = 0;
    let disposals = 0;
    registry.registerView({
      id: "example.view",
      title: "Example",
      mount(container) {
        mounts += 1;
        container.append(document.createElement("example-surface"));
        return () => {
          disposals += 1;
        };
      },
    });

    const host = new CwWorkbenchView();
    host.registry = registry;
    host.viewId = "example.view";
    document.body.append(host);
    await host.updateComplete;
    await Promise.resolve();
    expect(mounts).toBe(1);
    expect(host.shadowRoot?.querySelector("example-surface")).not.toBeNull();

    registry.setContext("streaming", true);
    await host.updateComplete;
    expect(mounts).toBe(1);
    expect(disposals).toBe(0);

    host.remove();
    expect(disposals).toBe(1);
  });
});
