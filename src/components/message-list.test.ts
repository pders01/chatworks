import { afterEach, describe, expect, test } from "bun:test";
import { GcMessageList } from "./chat-view/message-list.js";
import { MessageRole, type Turn } from "../lib/chat-types.js";

const completedPair: Turn[] = [
  {
    id: "user-1",
    role: MessageRole.USER,
    content: "Review the boundary.",
  },
  {
    id: "assistant-1",
    role: MessageRole.ASSISTANT,
    content: "The display boundary is coherent.",
  },
];

afterEach(() => {
  document.body.replaceChildren();
});

describe("cw-message-list chat-turn compatibility", () => {
  test("keeps action eligibility and editing state in the message list", async () => {
    const messages = new GcMessageList();
    messages.turns = completedPair;
    document.body.append(messages);
    await messages.updateComplete;

    const turns = messages.shadowRoot?.querySelectorAll<HTMLElement>("cw-chat-turn");
    expect(turns).toHaveLength(2);
    expect(turns?.[0]?.textContent).toContain("edit");
    expect(turns?.[0]?.textContent).toContain("copy");
    expect(turns?.[1]?.textContent).toContain("regenerate");

    const actionLabels = [...(turns?.[0]?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map(
      (button) => button.textContent?.trim(),
    );
    expect(actionLabels).toContain("edit");
    [...(turns?.[0]?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      .find((button) => button.textContent?.trim() === "edit")
      ?.click();
    expect((messages as unknown as { editingTurnId: string }).editingTurnId).toBe("user-1");
    await messages.updateComplete;

    const userTurn = messages.shadowRoot?.querySelector<HTMLElement>("cw-chat-turn");
    const editor = userTurn?.querySelector<HTMLTextAreaElement>("textarea");
    expect(editor?.value).toBe("Review the boundary.");
    expect(editor?.getAttribute("part")).toBe("edit-input");
  });

  test("preserves the historical edit-turn event payload", async () => {
    const messages = new GcMessageList();
    messages.turns = completedPair;
    document.body.append(messages);
    await messages.updateComplete;

    const userTurn = messages.shadowRoot?.querySelector<HTMLElement>("cw-chat-turn");
    [...(userTurn?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      .find((button) => button.textContent?.trim() === "edit")
      ?.click();
    await messages.updateComplete;

    let detail: { text: string; replaceFromMessageId: string; sliceAt: number } | undefined;
    messages.addEventListener("gc:edit-turn", (event) => {
      detail = event.detail;
    });
    const editor = userTurn?.querySelector<HTMLTextAreaElement>("textarea");
    if (editor) {
      editor.value = "Use the caller-owned body slot.";
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }

    expect(detail).toEqual({
      text: "Use the caller-owned body slot.",
      replaceFromMessageId: "user-1",
      sliceAt: 0,
    });
  });

  test("preserves retry and regeneration events", async () => {
    const messages = new GcMessageList();
    messages.turns = [completedPair[0]!, { ...completedPair[1]!, error: "Connection closed" }];
    document.body.append(messages);
    await messages.updateComplete;

    let retries = 0;
    let regenerations = 0;
    messages.addEventListener("gc:retry", () => {
      retries += 1;
    });
    messages.addEventListener("gc:regenerate", () => {
      regenerations += 1;
    });
    const assistant = messages.shadowRoot?.querySelectorAll<HTMLElement>("cw-chat-turn")[1];
    const buttons = assistant?.querySelectorAll<HTMLButtonElement>("button");
    [...(buttons ?? [])].find((button) => button.textContent?.trim() === "retry")?.click();
    [...(buttons ?? [])].find((button) => button.textContent?.trim() === "regenerate")?.click();

    expect(retries).toBe(1);
    expect(regenerations).toBe(1);
  });
});
