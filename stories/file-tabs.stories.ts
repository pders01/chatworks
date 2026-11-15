import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import "@jpahd/chatworks/repository-ui";
import { paths } from "./fixtures/repository-ui.js";

type Args = { empty: boolean };
const meta = {
  title: "Repository/Experimental source reading/File tabs",
  component: "cw-file-tabs",
  args: { empty: false },
  argTypes: {
    empty: {
      name: "Empty fixture",
      description: "Synthetic fixture contents, not a component property.",
      table: { category: "Fixture" },
      control: "boolean",
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Optional /repository-ui primitive. Local file navigation and reorder/close intent, not editor buffers. The host supplies panel content.",
      },
    },
  },
  render: ({ empty }: Args) => html`<main class="story-frame constrained">
    <div class="story-stack">
      <h1>Snapshot tabs</h1>
      <p>
        Arrow keys select; Alt+Shift+Arrow reorders. This panel is caller-owned read-only content.
      </p>
      <cw-file-tabs
        .tabs=${empty
          ? []
          : paths.map((path) => ({ id: path, label: path.split("/").at(-1)!, description: path }))}
        .activeId=${paths[0]}
        @cw:file-tabs-change=${(event: HTMLElementEventMap["cw:file-tabs-change"]) => {
          const tabs = event.currentTarget as HTMLElement;
          tabs.querySelector("p")!.textContent = event.detail.activeId
            ? `Read-only preview: ${event.detail.activeId}`
            : "No open files.";
        }}
        ><p>${empty ? "No open files." : `Read-only preview: ${paths[0]}`}</p></cw-file-tabs
      >
    </div>
  </main>`,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

function expectTabSemantics(tabs: HTMLElementTagNameMap["cw-file-tabs"]): void {
  const root = tabs.shadowRoot!;
  const tablist = root.querySelector<HTMLElement>('[role="tablist"]')!;
  const actions = root.querySelector<HTMLElement>('[role="group"]')!;
  expect(tablist).toHaveAccessibleName("Open files");
  expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(tabs.tabs.length);
  expect(tablist.querySelectorAll('button:not([role="tab"])')).toHaveLength(0);
  expect(actions).toHaveAccessibleName("File actions");
  expect(tablist.contains(actions)).toBe(false);
  expect(actions.querySelectorAll(".file-tab-close")).toHaveLength(tabs.tabs.length);
  expect(actions.querySelectorAll(".file-tab-grip")).toHaveLength(tabs.tabs.length);
  expect(actions.querySelectorAll(".file-tab, [data-file-tab-id]")).toHaveLength(0);
  expect(
    Array.from(root.querySelectorAll<HTMLElement>(".file-tab"), (cell) => cell.dataset.fileTabId),
  ).toEqual(tabs.tabs.map((tab) => tab.id));
  const selected = tablist.querySelector<HTMLButtonElement>('[aria-selected="true"]')!;
  expect(selected.getAttribute("aria-controls")).toBe("file-tab-panel");
  expect(root.querySelector('[role="tabpanel"]')!.getAttribute("aria-labelledby")).toBe(
    selected.id,
  );
  const tabStops = Array.from(actions.querySelectorAll<HTMLButtonElement>("button")).filter(
    (button) => button.tabIndex === 0,
  );
  expect(tabStops).toHaveLength(1);
  expect(tabStops[0]).toHaveAccessibleName(`Close ${selected.getAttribute("aria-label")}`);
}

export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const tabs = canvasElement.querySelector("cw-file-tabs")!;
    await tabs.updateComplete;
    expectTabSemantics(tabs);
    const changed = fn();
    tabs.addEventListener("cw:file-tabs-change", changed);
    await userEvent.click(tabs.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]);
    await waitFor(() => expect(tabs.activeId).toBe(paths[1]));
    expect(changed.mock.calls.at(-1)![0].detail.action).toBe("select");
    expect(tabs.querySelector("p")!.textContent).toContain(paths[1]);
    const close = tabs.shadowRoot!.querySelector<HTMLButtonElement>(
      'button[aria-label="Close src/plant.ts"]',
    )!;
    await userEvent.click(close);
    await waitFor(() => expect(tabs.tabs.length).toBe(3));
    await waitFor(() =>
      expect(tabs.shadowRoot!.activeElement).toBe(
        tabs.shadowRoot!.querySelector('[role="tab"][aria-selected="true"]'),
      ),
    );
    expect(changed.mock.calls.at(-1)![0].detail.action).toBe("close");
    expectTabSemantics(tabs);
    tabs.removeEventListener("cw:file-tabs-change", changed);
  },
};
export const KeyboardReorder: Story = {
  play: async ({ canvasElement }) => {
    const tabs = canvasElement.querySelector("cw-file-tabs")!;
    await tabs.updateComplete;
    const changed = fn();
    tabs.addEventListener("cw:file-tabs-change", changed, { once: true });
    expectTabSemantics(tabs);
    const first = tabs.shadowRoot!.querySelector<HTMLButtonElement>('[role="tab"]')!;
    const firstCell = first.closest(".file-tab");
    const firstActions = tabs.shadowRoot!.querySelector(".file-tab-actions");
    first.focus();
    await userEvent.keyboard("{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}");
    await waitFor(() => expect(tabs.tabs[1].id).toBe(paths[0]));
    expect(changed.mock.calls[0][0].detail.action).toBe("reorder");
    expect(tabs.activeId).toBe(paths[0]);
    expect(tabs.shadowRoot!.activeElement).toBe(first);
    expect(tabs.shadowRoot!.querySelectorAll(".file-tab")[1]).toBe(firstCell);
    expect(tabs.shadowRoot!.querySelectorAll(".file-tab-actions")[1]).toBe(firstActions);
    expectTabSemantics(tabs);
  },
};
export const KeyboardClose: Story = {
  play: async ({ canvasElement }) => {
    const tabs = canvasElement.querySelector("cw-file-tabs")!;
    await tabs.updateComplete;
    expectTabSemantics(tabs);
    const close = tabs.shadowRoot!.querySelector<HTMLButtonElement>(
      'button[aria-label="Close README.md"]',
    )!;
    // Native Tab traversal through shadow DOM is covered by boundaries.spec.ts;
    // testing-library's synthetic Tab only queries the light DOM.
    expect(close.tabIndex).toBe(0);
    close.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(tabs.tabs.length).toBe(3));
    expect(tabs.activeId).toBe(paths[1]);
    await waitFor(() =>
      expect(tabs.shadowRoot!.activeElement).toBe(
        tabs.shadowRoot!.querySelector('[role="tab"][aria-selected="true"]'),
      ),
    );
    expectTabSemantics(tabs);
  },
};
export const Empty: Story = {
  args: { empty: true },
  play: async ({ canvasElement }) => {
    const tabs = canvasElement.querySelector("cw-file-tabs")!;
    await tabs.updateComplete;
    expect(tabs.tabs).toHaveLength(0);
    expect(tabs.textContent).toContain("No open files.");
  },
};
