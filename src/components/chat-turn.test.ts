import { afterEach, describe, expect, test } from "bun:test";
import { CwChatTurn } from "./chat-turn.js";
import { MessageRole, type Turn } from "../lib/chat-types.js";

const assistantTurn: Turn = {
  id: "assistant-1",
  role: MessageRole.ASSISTANT,
  content: "Use a display-only boundary.",
  html: "<p>Use a <strong>display-only</strong> boundary.</p>",
  model: "CLAUDE-SONNET-4",
  tokensIn: 1_200,
  tokensOut: 300,
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("cw-chat-turn", () => {
  test("keeps a narrow one-property data API", () => {
    expect([...CwChatTurn.elementProperties.keys()]).toEqual(["turn"]);
  });

  test("renders nothing without a turn", async () => {
    const element = new CwChatTurn();
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.childElementCount).toBe(0);
  });

  test("renders assistant HTML, model, and token metadata with stable parts", async () => {
    const element = new CwChatTurn();
    element.turn = assistantTurn;
    document.body.append(element);
    await element.updateComplete;

    const article = element.shadowRoot?.querySelector<HTMLElement>("article");
    expect(article?.getAttribute("part")).toBe("turn assistant");
    expect(element.shadowRoot?.querySelector("[part='turn-label']")?.textContent).toContain(
      "assistant",
    );
    expect(element.shadowRoot?.querySelector("[part='turn-model']")?.textContent).toBe(
      "claude-sonnet-4",
    );
    expect(element.shadowRoot?.querySelector("[part='body md'] strong")?.textContent).toBe(
      "display-only",
    );
    const tokenInfo = element.shadowRoot
      ?.querySelector("[part='token-info']")
      ?.textContent?.replace(/\s+/g, " ");
    expect(tokenInfo).toContain("1,200 in · 300 out");
  });

  test("composes user attachments and warnings through nested primitives", async () => {
    const attachment = {
      filename: "notes.md",
      mimeType: "text/markdown",
      size: 2_048,
      data: new Uint8Array(),
    };
    const element = new CwChatTurn();
    element.turn = {
      id: "user-1",
      role: MessageRole.USER,
      content: "Review this file.",
      attachments: [attachment],
      warnings: ["Image metadata was omitted"],
    };
    document.body.append(element);
    await element.updateComplete;

    const nested = element.shadowRoot?.querySelector<HTMLElement>("cw-attachment");
    expect(element.shadowRoot?.querySelector("article")?.getAttribute("part")).toBe("turn user");
    expect(nested?.getAttribute("exportparts")).toContain("attachment-chip");
    expect((nested as unknown as { attachment?: unknown }).attachment).toBe(attachment);
    expect(element.shadowRoot?.querySelector("[part='turn-warning']")?.textContent).toContain(
      "Image metadata was omitted",
    );
  });

  test("accepts caller-owned action and body slots", async () => {
    const element = new CwChatTurn();
    element.turn = {
      id: "user-edit",
      role: MessageRole.USER,
      content: "Original",
    };
    const action = document.createElement("button");
    action.slot = "actions";
    action.textContent = "edit";
    const editor = document.createElement("textarea");
    editor.slot = "body";
    editor.value = "Replacement";
    element.append(action, editor);
    document.body.append(element);
    await element.updateComplete;

    const actionSlot = element.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="actions"]');
    const bodySlot = element.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="body"]');
    expect(actionSlot?.assignedElements()).toEqual([action]);
    expect(bodySlot?.assignedElements()).toEqual([editor]);
  });

  test("renders nested thinking and tool boundaries without taking their state", async () => {
    const element = new CwChatTurn();
    element.turn = {
      ...assistantTurn,
      thinking: "Inspect the boundary.",
      thinkingExpanded: true,
      tools: [
        {
          id: "check",
          name: "bash",
          argsJson: '{"command":"bun run check"}',
          state: "running",
        },
      ],
    };
    document.body.append(element);
    await element.updateComplete;

    const thinking = element.shadowRoot?.querySelector<HTMLElement>("cw-thinking-disclosure");
    const tool = element.shadowRoot?.querySelector<HTMLElement>("cw-tool-event");
    expect((thinking as unknown as { expanded?: boolean }).expanded).toBe(true);
    expect(thinking?.getAttribute("exportparts")).toContain("thinking-body");
    expect(tool?.getAttribute("exportparts")).toContain("tool-event");
  });
});
