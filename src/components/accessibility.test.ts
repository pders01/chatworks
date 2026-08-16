import { afterEach, describe, expect, test } from "bun:test";
import { GcComposer } from "./chat-view/composer.js";
import { GcCombobox } from "./combobox.js";
import { CwDiffView } from "./diff-view.js";

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
