import { afterEach, describe, expect, test } from "bun:test";
import { CwToolEvent } from "./tool-event.js";
import type { ToolEvent } from "../lib/chat-types.js";

const completed: ToolEvent = {
  id: "read-contract",
  name: "read",
  argsJson: '{"path":"docs/workbench.md"}',
  state: "done",
  content: "Loaded 148 lines",
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("cw-tool-event", () => {
  test("renders nothing without tool event data", async () => {
    const element = new CwToolEvent();
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.childElementCount).toBe(0);
  });

  test("renders a completed tool with semantic state and stable parts", async () => {
    const element = new CwToolEvent();
    element.toolEvent = completed;
    document.body.append(element);
    await element.updateComplete;

    const item = element.shadowRoot?.querySelector<HTMLElement>(".tool-event");
    const button = element.shadowRoot?.querySelector<HTMLButtonElement>("button");
    expect(item?.getAttribute("role")).toBe("listitem");
    expect(item?.getAttribute("part")).toBe("tool-event done");
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(element.shadowRoot?.querySelector("[part='tool-name']")?.textContent).toBe("read");
    expect(element.shadowRoot?.querySelector("[part='tool-summary']")?.textContent).toBe(
      "path=docs/workbench.md",
    );
  });

  test("requests a disclosure change without owning expanded state", async () => {
    const element = new CwToolEvent();
    element.toolEvent = completed;
    document.body.append(element);
    await element.updateComplete;

    let detail: { toolEvent: ToolEvent; expanded: boolean } | undefined;
    element.addEventListener("gc:toggle-tool-event", (event) => {
      detail = event.detail;
    });
    element.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();

    expect(detail).toEqual({ toolEvent: completed, expanded: true });
    expect(element.toolEvent).toBe(completed);
    expect(element.toolEvent.expanded).toBeUndefined();
  });

  test("formats expanded error details and exposes their state parts", async () => {
    const element = new CwToolEvent();
    element.toolEvent = {
      ...completed,
      state: "error",
      expanded: true,
      content: "Connection closed",
    };
    document.body.append(element);
    await element.updateComplete;

    const bodies = element.shadowRoot?.querySelectorAll<HTMLElement>(".tool-body-pre");
    expect(bodies?.[0]?.textContent).toContain('"path": "docs/workbench.md"');
    expect(bodies?.[1]?.getAttribute("part")).toBe("tool-body-pre is-error");
    expect(element.shadowRoot?.querySelector("[part='tool-body-label']")?.textContent).toBe("args");
    expect(element.shadowRoot?.textContent).toContain("result (error)");
  });

  test("does not offer disclosure while a tool is running", async () => {
    const element = new CwToolEvent();
    element.toolEvent = { ...completed, state: "running" };
    document.body.append(element);
    await element.updateComplete;

    let toggled = false;
    element.addEventListener("gc:toggle-tool-event", () => {
      toggled = true;
    });
    const button = element.shadowRoot?.querySelector<HTMLButtonElement>("button");
    button?.click();

    expect(button?.disabled).toBe(true);
    expect(element.shadowRoot?.querySelector("[part='tool-caret']")).toBeNull();
    expect(toggled).toBe(false);
  });
});
