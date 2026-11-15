import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import "@jpahd/chatworks/repository-ui";
import { scope, treeClient, type ReadState } from "./fixtures/repository-ui.js";

type Args = { state: ReadState };
const meta = {
  title: "Repository/Experimental source reading/Repository tree",
  component: "cw-repository-tree",
  args: { state: "loaded" },
  argTypes: {
    state: {
      name: "Fixture state",
      description: "Synthetic injected-client scenario, not a component property.",
      table: { category: "Fixture" },
      control: "select",
      options: ["loaded", "unbound", "loading", "empty", "error", "bounded"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Optional /repository-ui primitive. Lazy native directory disclosures and file-open events, bound to an immutable snapshot. No filesystem or backend access.",
      },
    },
  },
  render: ({ state }: Args) => html`<main class="story-frame constrained">
    <div class="story-stack">
      <h1>Repository navigation</h1>
      <p>Directories read children only when expanded. File buttons emit intent.</p>
      <cw-repository-tree
        .scope=${state === "unbound" ? undefined : scope}
        .client=${state === "unbound" ? undefined : treeClient(state)}
      ></cw-repository-tree>
    </div>
  </main>`,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
function stateStory(state: ReadState, text: string): Story {
  return {
    args: { state },
    play: async ({ canvasElement }) => {
      const tree = canvasElement.querySelector("cw-repository-tree")!;
      await waitFor(() => expect(tree.shadowRoot?.textContent).toContain(text));
    },
  };
}
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const tree = canvasElement.querySelector("cw-repository-tree")!;
    const intent = fn();
    tree.addEventListener("cw:file-open", intent, { once: true });
    await waitFor(() => expect(tree.shadowRoot?.querySelector("summary")).not.toBeNull());
    expect(tree.shadowRoot!.textContent).not.toContain("plant.ts");
    await userEvent.click(tree.shadowRoot!.querySelector("summary")!);
    await waitFor(() => expect(tree.shadowRoot?.textContent).toContain("plant.ts"));
    await userEvent.click(
      [...tree.shadowRoot!.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "plant.ts",
      )!,
    );
    expect(intent).toHaveBeenCalledOnce();
    expect(intent.mock.calls[0][0].detail).toEqual({ ...scope, path: "src/plant.ts" });
  },
};
export const Unbound = stateStory("unbound", "Choose a repository snapshot.");
export const Loading = stateStory("loading", "Loading…");
export const Empty = stateStory("empty", "Empty directory.");
export const Error = stateStory("error", "Synthetic snapshot unavailable.");
export const Bounded = stateStory("bounded", "More entries exist; listing truncated.");
