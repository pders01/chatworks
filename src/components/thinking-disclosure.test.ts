import { afterEach, describe, expect, test } from "bun:test";
import { CwThinkingDisclosure } from "./thinking-disclosure.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("cw-thinking-disclosure", () => {
  test("renders nothing without thinking text", async () => {
    const element = new CwThinkingDisclosure();
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.childElementCount).toBe(0);
  });

  test("uses native disclosure semantics and stable parts", async () => {
    const element = new CwThinkingDisclosure();
    element.thinking = "Review the extension boundary.";
    document.body.append(element);
    await element.updateComplete;

    const details = element.shadowRoot?.querySelector<HTMLDetailsElement>("details");
    expect(details?.open).toBe(false);
    expect(details?.getAttribute("part")).toBe("thinking-block");
    expect(element.shadowRoot?.querySelector("summary")?.getAttribute("part")).toBe(
      "thinking-head",
    );
    expect(element.shadowRoot?.querySelector("[part='thinking-label']")?.textContent).toBe(
      "thinking",
    );
    expect(element.shadowRoot?.querySelector("[part='thinking-body']")).toBeNull();
  });

  test("renders caller-owned expanded reasoning as escaped text", async () => {
    const element = new CwThinkingDisclosure();
    element.thinking = "Compare <cw-chat-turn> boundaries.";
    element.expanded = true;
    document.body.append(element);
    await element.updateComplete;

    const details = element.shadowRoot?.querySelector<HTMLDetailsElement>("details");
    const body = element.shadowRoot?.querySelector<HTMLElement>("[part='thinking-body']");
    expect(details?.open).toBe(true);
    expect(body?.textContent).toBe("Compare <cw-chat-turn> boundaries.");
    expect(body?.querySelector("cw-chat-turn")).toBeNull();
    expect(element.hasAttribute("expanded")).toBe(true);
  });

  test("requests native disclosure changes without mutating the public property", async () => {
    const element = new CwThinkingDisclosure();
    element.thinking = "Inspect the message list.";
    document.body.append(element);
    await element.updateComplete;

    let requested: boolean | undefined;
    element.addEventListener("gc:toggle-thinking", (event) => {
      requested = event.detail.expanded;
    });
    const details = element.shadowRoot?.querySelector<HTMLDetailsElement>("details");
    if (details) {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    }

    expect(requested).toBe(true);
    expect(element.expanded).toBe(false);
  });

  test("labels and exposes streaming state", async () => {
    const element = new CwThinkingDisclosure();
    element.thinking = "Inspecting…";
    element.streaming = true;
    document.body.append(element);
    await element.updateComplete;

    expect(element.hasAttribute("streaming")).toBe(true);
    expect(element.shadowRoot?.querySelector("details")?.getAttribute("part")).toBe(
      "thinking-block is-streaming",
    );
    expect(element.shadowRoot?.querySelector("[part='thinking-label']")?.textContent).toBe(
      "thinking…",
    );
  });
});
