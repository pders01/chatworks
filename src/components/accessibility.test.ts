import { afterEach, describe, expect, test } from "bun:test";
import { GcComposer } from "./chat-view/composer.js";
import { GcMessageList } from "./chat-view/message-list.js";
import { CwChatTurn } from "./chat-turn.js";
import { GcCombobox } from "./combobox.js";
import { CwDiffView } from "./diff-view.js";
import { MessageRole, type Turn } from "../lib/chat-types.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("component accessibility semantics", () => {
  test("names the combobox and keeps options free of nested controls", async () => {
    const combobox = new GcCombobox();
    combobox.label = "Assistant model";
    combobox.options = [
      { value: "mini", label: "Mini", description: "Fast model" },
      { value: "large", label: "Large", description: "Reasoning model" },
    ];
    document.body.append(combobox);
    await combobox.updateComplete;

    const input = combobox.shadowRoot?.querySelector<HTMLInputElement>("input");
    expect(input?.getAttribute("role")).toBe("combobox");
    expect(input?.getAttribute("aria-label")).toBe("Assistant model");
    expect(input?.getAttribute("part")).toBe("input");

    input?.focus();
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await combobox.updateComplete;
    const listbox = combobox.shadowRoot?.querySelector('[role="listbox"]');
    const options = [...(listbox?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    expect(options).toHaveLength(2);
    expect(options[0]?.getAttribute("part")).toContain("option");
    expect(options[0]?.getAttribute("part")).toContain("active");
    expect(
      options.every(
        (option) => option.querySelector("button, input, a, select, textarea") === null,
      ),
    ).toBe(true);
  });

  test("announces an empty combobox without requiring a sentinel value", async () => {
    const combobox = new GcCombobox();
    combobox.label = "Assistant model";
    combobox.emptyHint = "Connect a provider to discover models";
    document.body.append(combobox);
    await combobox.updateComplete;

    const input = combobox.shadowRoot?.querySelector<HTMLInputElement>("input");
    input?.focus();
    await combobox.updateComplete;

    const status = combobox.shadowRoot?.querySelector<HTMLElement>('[role="status"]');
    expect(input?.value).toBe("");
    expect(input?.getAttribute("aria-expanded")).toBe("true");
    expect(status?.id).toBe(input?.getAttribute("aria-controls") ?? undefined);
    expect(status?.textContent).toContain("Connect a provider");
  });

  test("exposes composer suggestions from its multiline textbox without nested controls", async () => {
    const composer = new GcComposer();
    document.body.append(composer);
    composer.setInput("/");
    await composer.updateComplete;

    const textarea = composer.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea");
    textarea?.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    await composer.updateComplete;

    const listbox = composer.shadowRoot?.querySelector<HTMLElement>('[role="listbox"]');
    const activeId = textarea?.getAttribute("aria-activedescendant");
    expect(textarea?.getAttribute("aria-autocomplete")).toBe("list");
    expect(textarea?.getAttribute("part")).toBe("input");
    expect(textarea?.hasAttribute("aria-expanded")).toBe(false);
    expect(listbox?.id).toBe("slash-list");
    expect(listbox?.tabIndex).toBe(0);
    expect(activeId).toBeTruthy();
    expect(composer.shadowRoot?.getElementById(activeId ?? "")).not.toBeNull();
    expect(listbox?.querySelector("[role='option'] button")).toBeNull();
    expect(listbox?.querySelector("[role='option']")?.getAttribute("part")).toContain("active");
  });

  test("preserves attachment parts through the message-list compatibility wrapper", async () => {
    const attachment = {
      filename: "notes.md",
      mimeType: "text/markdown",
      size: 12,
      data: new Uint8Array(),
    };
    const messages = new GcMessageList();
    messages.turns = [
      {
        id: "user-1",
        role: MessageRole.USER,
        content: "Review this file",
        attachments: [attachment],
      },
    ];
    document.body.append(messages);
    await messages.updateComplete;

    const turn = messages.shadowRoot?.querySelector<CwChatTurn>("cw-chat-turn");
    await turn?.updateComplete;
    const primitive = turn?.shadowRoot?.querySelector<HTMLElement>("cw-attachment");
    expect(turn?.getAttribute("exportparts")).toContain("attachment-chip");
    expect(primitive?.getAttribute("part")).toBe("attachment");
    expect(primitive?.getAttribute("exportparts")).toContain("attachment-chip");
    expect((primitive as unknown as { attachment?: unknown })?.attachment).toBe(attachment);
  });

  test("preserves tool parts and turn ownership through the message-list wrapper", async () => {
    const toolEvent = {
      id: "read-contract",
      name: "read",
      argsJson: '{"path":"docs/workbench.md"}',
      state: "done" as const,
    };
    const turns: Turn[] = [
      {
        id: "assistant-1",
        role: MessageRole.ASSISTANT,
        content: "Review complete",
        tools: [toolEvent],
      },
    ];
    const messages = new GcMessageList();
    messages.turns = turns;
    document.body.append(messages);
    await messages.updateComplete;

    const turn = messages.shadowRoot?.querySelector<CwChatTurn>("cw-chat-turn");
    await turn?.updateComplete;
    const primitive = turn?.shadowRoot?.querySelector<HTMLElement>("cw-tool-event");
    expect(turn?.getAttribute("exportparts")).toContain("tool-body-pre");
    expect(primitive?.getAttribute("exportparts")).toContain("tool-event");
    expect(primitive?.getAttribute("exportparts")).toContain("tool-body-pre");
    expect((primitive as unknown as { toolEvent?: unknown })?.toolEvent).toBe(toolEvent);

    let updated = turns;
    messages.addEventListener("gc:update-turns", (event) => {
      updated = event.detail.updater(turns);
    });
    primitive?.dispatchEvent(
      new CustomEvent("gc:toggle-tool-event", {
        detail: { toolEvent, expanded: true },
        bubbles: true,
        composed: true,
      }),
    );

    expect(updated).not.toBe(turns);
    expect(updated[0]?.tools?.[0]?.expanded).toBe(true);
    expect(messages.turns).toBe(turns);
  });

  test("preserves thinking parts and turn ownership through the message-list wrapper", async () => {
    const turns: Turn[] = [
      {
        id: "assistant-thinking",
        role: MessageRole.ASSISTANT,
        content: "",
        thinking: "Review the display boundary.",
      },
    ];
    const messages = new GcMessageList();
    messages.turns = turns;
    document.body.append(messages);
    await messages.updateComplete;

    const turn = messages.shadowRoot?.querySelector<CwChatTurn>("cw-chat-turn");
    await turn?.updateComplete;
    const primitive = turn?.shadowRoot?.querySelector<HTMLElement>("cw-thinking-disclosure");
    expect(turn?.getAttribute("exportparts")).toContain("thinking-body");
    expect(primitive?.getAttribute("exportparts")).toContain("thinking-block");
    expect(primitive?.getAttribute("exportparts")).toContain("thinking-body");
    expect((primitive as unknown as { thinking?: unknown })?.thinking).toBe(turns[0]?.thinking);

    let updated = turns;
    messages.addEventListener("gc:update-turns", (event) => {
      updated = event.detail.updater(turns);
    });
    primitive?.dispatchEvent(
      new CustomEvent("gc:toggle-thinking", {
        detail: { expanded: true },
        bubbles: true,
        composed: true,
      }),
    );

    expect(updated).not.toBe(turns);
    expect(updated[0]?.thinkingExpanded).toBe(true);
    expect(messages.turns).toBe(turns);
  });

  test("makes a rendered diff scroller keyboard focusable and named", async () => {
    const diff = new CwDiffView();
    diff.label = "Working tree changes";
    diff.rawDiff = "@@ -1 +1 @@\n-old\n+new\n";
    document.body.append(diff);

    let viewport: HTMLElement | null = null;
    for (let attempt = 0; attempt < 100 && !viewport; attempt += 1) {
      await diff.updateComplete;
      viewport = diff.shadowRoot?.querySelector<HTMLElement>(".viewport") ?? null;
      if (!viewport) await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(viewport?.getAttribute("role")).toBe("region");
    expect(viewport?.getAttribute("aria-label")).toBe("Working tree changes");
    expect(viewport?.tabIndex).toBe(0);
    expect(viewport?.getAttribute("part")).toBe("viewport");
    expect(diff.shadowRoot?.querySelector(".addition")?.getAttribute("part")).toBe("line addition");
  });
});
