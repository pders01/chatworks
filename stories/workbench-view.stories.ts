import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { expect, fn, waitFor } from "storybook/test";
import "@jpahd/chatworks/workbench-view";
import { createWorkbenchFixture } from "./fixtures/workbench.js";

type Args = { state: "loaded" | "unbound" | "missing" | "error" };
const meta = {
  title: "Workbench/View",
  component: "cw-workbench-view",
  args: { state: "loaded" },
  argTypes: {
    state: {
      name: "Fixture state",
      description: "Synthetic registry scenario, not a component property.",
      table: { category: "Fixture" },
      control: "select",
      options: ["loaded", "unbound", "missing", "error"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Registry-driven view mounting and disposal. The library supplies the mount surface, while the extension owns its content and cleanup.",
      },
    },
  },
  render: ({ state }: Args) => {
    const registry = createWorkbenchFixture();
    registry.registerView({
      id: "garden.error",
      title: "Unavailable",
      mount() {
        throw new Error("Synthetic extension mount failed.");
      },
    });
    return html`<main class="story-frame constrained">
      <div class="story-stack">
        <h1>View mounting</h1>
        <cw-workbench-view
          .registry=${state === "unbound" ? undefined : registry}
          .viewId=${state === "missing"
            ? "garden.missing"
            : state === "error"
              ? "garden.error"
              : "garden.overview"}
          .empty=${"Choose a workbench view."}
        ></cw-workbench-view>
      </div>
    </main>`;
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const view = canvasElement.querySelector("cw-workbench-view")!;
    await waitFor(() => expect(view.shadowRoot?.textContent).toContain("Beds are ready"));
    view.viewId = "garden.schedule";
    await waitFor(() => expect(view.shadowRoot?.textContent).toContain("Water seedlings"));
    expect(view.shadowRoot!.textContent).not.toContain("Beds are ready");
  },
};
export const Unbound: Story = { args: { state: "unbound" } };
export const MissingView: Story = { args: { state: "missing" } };
export const MountError: Story = {
  args: { state: "error" },
  play: async ({ canvasElement }) => {
    const view = canvasElement.querySelector("cw-workbench-view")!;
    await waitFor(() =>
      expect(view.shadowRoot?.textContent).toContain("Synthetic extension mount failed."),
    );
    const error = fn();
    view.addEventListener("cw:view-error", error, { once: true });
    view.viewId = "garden.overview";
    await waitFor(() => expect(view.shadowRoot?.textContent).toContain("Beds are ready"));
    view.viewId = "garden.error";
    await waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(error.mock.calls[0][0].detail.viewId).toBe("garden.error");
  },
};
