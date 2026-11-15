import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import "@jpahd/chatworks/command-palette";
import { WorkbenchRegistry } from "@jpahd/chatworks/workbench";
import { createWorkbenchFixture } from "./fixtures/workbench.js";

type Args = { state: "loaded" | "empty" | "error" };
const meta = {
  title: "Workbench/Command palette",
  component: "cw-command-palette",
  args: { state: "loaded" },
  argTypes: {
    state: {
      name: "Fixture state",
      description: "Synthetic registry scenario, not a component property.",
      table: { category: "Fixture" },
      control: "select",
      options: ["loaded", "empty", "error"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Searchable registry commands. Hosts provide command behavior; success and failure emit public semantic events. These synthetic commands only update an in-memory registry.",
      },
    },
  },
  render: ({ state }: Args) => {
    const registry = state === "empty" ? new WorkbenchRegistry() : createWorkbenchFixture();
    if (state === "error")
      registry.registerCommand({
        id: "garden.fail",
        title: "Unavailable action",
        run() {
          throw new Error("Synthetic command failed. Try another action.");
        },
      });
    return html`<main class="story-frame constrained">
      <div class="story-stack">
        <h1>Command discovery</h1>
        <div class="story-controls">
          <button
            type="button"
            @click=${(event: Event) =>
              (event.currentTarget as HTMLElement)
                .closest("main")!
                .querySelector("cw-command-palette")!
                .show()}
          >
            Open commands
          </button>
        </div>
        <cw-command-palette .registry=${registry}></cw-command-palette>
      </div>
    </main>`;
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
async function open(canvas: HTMLElement) {
  await userEvent.click(canvas.querySelector("button")!);
  const palette = canvas.querySelector("cw-command-palette")!;
  await palette.updateComplete;
  return palette;
}
export const Browsing: Story = {
  play: async ({ canvasElement }) => {
    const palette = await open(canvasElement);
    await waitFor(() =>
      expect(palette.shadowRoot!.querySelectorAll('[role="option"]').length).toBe(2),
    );
  },
};
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const palette = await open(canvasElement);
    const executed = fn();
    palette.addEventListener("cw:command-executed", executed, { once: true });
    const input = palette.shadowRoot!.querySelector("input")!;
    await userEvent.type(input, "no-such-command");
    await waitFor(() =>
      expect(palette.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(0),
    );
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    // Keyboard editing avoids clear()\'s document-only focus check for shadow inputs.
    await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
    await waitFor(() =>
      expect(palette.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(2),
    );
    expect(input.getAttribute("aria-activedescendant")).toBe("cw-command-0");
    await userEvent.type(input, "schedule");
    await waitFor(() =>
      expect(palette.shadowRoot!.querySelectorAll('[role="option"]').length).toBe(1),
    );
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(executed).toHaveBeenCalledOnce());
    expect(executed.mock.calls[0][0].detail.id).toBe("garden.schedule.open");
    expect(palette.registry!.activeView()).toBe("garden.schedule");
    expect(palette.open).toBe(false);
  },
};
export const Empty: Story = {
  args: { state: "empty" },
  play: async ({ canvasElement }) => {
    const palette = await open(canvasElement);
    expect(palette.shadowRoot!.querySelector('[role="listbox"]')!.children).toHaveLength(0);
    expect(palette.shadowRoot!.querySelector('[role="status"]')!.textContent).toContain(
      "No matching commands",
    );
    expect(palette.shadowRoot!.querySelector("input")!.getAttribute("aria-label")).toBe(
      "Search commands",
    );
  },
};
export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    const palette = await open(canvasElement);
    const input = palette.shadowRoot!.querySelector("input")!;
    await userEvent.type(input, "no-such-command");
    await waitFor(() =>
      expect(palette.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(0),
    );
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(palette.shadowRoot!.querySelector('[role="listbox"]')!.children).toHaveLength(0);
    expect(palette.shadowRoot!.querySelector('[role="status"]')!.textContent).toContain(
      "No matching commands",
    );
  },
};
export const CommandError: Story = {
  args: { state: "error" },
  play: async ({ canvasElement }) => {
    const palette = await open(canvasElement);
    const error = fn();
    palette.addEventListener("cw:command-error", error, { once: true });
    await userEvent.type(palette.shadowRoot!.querySelector("input")!, "Unavailable");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(error.mock.calls[0][0].detail.id).toBe("garden.fail");
    expect(palette.open).toBe(true);
    expect(palette.shadowRoot!.textContent).toContain("Synthetic command failed.");
  },
};
