import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import "@jpahd/chatworks/workbench-switcher";
import { WorkbenchRegistry } from "@jpahd/chatworks/workbench";
import { createWorkbenchFixture } from "./fixtures/workbench.js";

type Args = { empty: boolean };
const meta = {
  title: "Workbench/Switcher",
  component: "cw-workbench-switcher",
  args: { empty: false },
  argTypes: {
    empty: {
      name: "Empty fixture",
      description: "Synthetic fixture contents, not a component property.",
      table: { category: "Fixture" },
      control: "boolean",
    },
  },
  render: ({ empty }: Args) => html`<main class="story-frame constrained">
    <div class="story-stack">
      <h1>View navigation</h1>
      <p>
        Switching emits intent and changes the active registry view. It does not mount content by
        itself.
      </p>
      <cw-workbench-switcher
        .registry=${empty ? new WorkbenchRegistry() : createWorkbenchFixture()}
      ></cw-workbench-switcher>
    </div>
  </main>`,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const switcher = canvasElement.querySelector("cw-workbench-switcher")!;
    await switcher.updateComplete;
    const selected = fn();
    switcher.addEventListener("cw:view-selected", selected, { once: true });
    await userEvent.click(
      [...switcher.shadowRoot!.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Schedule"),
      )!,
    );
    await waitFor(() => expect(switcher.registry!.activeView()).toBe("garden.schedule"));
    expect(selected).toHaveBeenCalledOnce();
  },
};
export const Empty: Story = { args: { empty: true } };
