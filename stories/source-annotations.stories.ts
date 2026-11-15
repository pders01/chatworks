import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import "@jpahd/chatworks/source-annotations";
// Safe fixture module only: unlike example/main.ts this never mounts globally.
import {
  CONTENT,
  MemoryAnnotationClient,
  PATH,
  REF,
} from "../examples/source-annotations/memory-client.js";

type State = "loaded" | "unbound" | "loading" | "empty" | "empty-file" | "error" | "read-only";
type Args = { state: State };
const meta = {
  title: "Repository/Experimental source reading/Source annotations",
  component: "source-annotation-panel",
  args: { state: "loaded" },
  argTypes: {
    state: {
      name: "Fixture state",
      description: "Synthetic injected-client scenario, not a component property.",
      table: { category: "Fixture" },
      control: "select",
      options: ["loaded", "unbound", "loading", "empty", "empty-file", "error", "read-only"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Optional /source-annotations entry. Exact source selection, scoped drafts and revision-checked notes. Synthetic volatile client only; hosts own identity, storage and authorization. No automatic note upload or backend parity.",
      },
    },
  },
  render: ({ state }: Args) => {
    const client = new MemoryAnnotationClient(
      state === "empty" || state === "empty-file" ? [] : undefined,
    );
    client.failList = state === "error";
    if (state === "loading") client.list = () => new Promise(() => {});
    return html`<main class="story-frame constrained">
      <div class="story-stack">
        <h1>Source notes</h1>
        <p>
          ${state === "unbound"
            ? "No annotation client bound: source remains readable, authoring is unavailable."
            : "Synthetic immutable source and private reference notes. Select a line to inspect authoring."}
        </p>
        <source-annotation-panel
          .client=${state === "unbound" ? undefined : client}
          .scopeKey=${"story:synthetic-garden/account-a"}
          .path=${PATH}
          .ref=${REF}
          .requestedRef=${"main"}
          .active=${true}
          .sourceView=${true}
          .allowCreate=${state !== "unbound"}
          .readOnly=${state === "read-only" || state === "unbound"}
          .content=${state === "empty-file" ? "" : CONTENT}
          .maxLine=${state === "empty-file" ? 0 : CONTENT.trimEnd().split("\n").length}
        ></source-annotation-panel>
      </div>
    </main>`;
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
function stateStory(state: State, text: string): Story {
  return {
    args: { state },
    play: async ({ canvasElement }) => {
      const panel = canvasElement.querySelector("source-annotation-panel")!;
      await waitFor(() => expect(panel.shadowRoot?.textContent).toContain(text));
    },
  };
}
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const panel = canvasElement.querySelector("source-annotation-panel")!;
    await waitFor(() =>
      expect(panel.shadowRoot?.querySelectorAll(".virtual-annotation").length).toBe(2),
    );
    expect(panel.shadowRoot!.textContent).toContain("Notes not placed in this source (1)");
    const filter = panel.shadowRoot!.querySelector<HTMLSelectElement>("select")!;
    await userEvent.selectOptions(filter, "invariant");
    await waitFor(() =>
      expect(panel.shadowRoot!.querySelectorAll(".virtual-annotation").length).toBe(1),
    );
  },
};
export const CreateNote: Story = {
  args: { state: "empty" },
  play: async ({ canvasElement }) => {
    const panel = canvasElement.querySelector("source-annotation-panel")!;
    const changed = fn();
    panel.addEventListener("source-annotations-changed", changed, { once: true });
    await waitFor(() => expect(panel.shadowRoot?.textContent).toContain("No notes yet."));
    await userEvent.click(
      panel.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Select line 5"]')!,
    );
    await panel.updateComplete;
    await userEvent.click(
      panel.shadowRoot!.querySelector<HTMLButtonElement>(".selection-tools button")!,
    );
    await panel.updateComplete;
    await userEvent.type(
      panel.shadowRoot!.querySelector<HTMLTextAreaElement>('[aria-label="New annotation body"]')!,
      "Keep this cache request-local.",
    );
    await userEvent.click(
      panel.shadowRoot!.querySelector<HTMLButtonElement>('button[type="submit"]')!,
    );
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(changed.mock.calls[0][0].detail).toEqual({
      scopeKey: panel.scopeKey,
      path: PATH,
      ref: REF,
    });
    await waitFor(() =>
      expect(panel.shadowRoot!.textContent).toContain("Keep this cache request-local."),
    );
  },
};
export const Unbound = stateStory("unbound", "Read only");
export const Loading = stateStory("loading", "Loading annotations…");
export const Empty = stateStory("empty", "No notes yet.");
export const EmptyFile = stateStory("empty-file", "Empty file.");
export const Error = stateStory("error", "Notes could not be loaded.");
export const ReadOnly: Story = {
  args: { state: "read-only" },
  play: async ({ canvasElement }) => {
    const panel = canvasElement.querySelector("source-annotation-panel")!;
    await waitFor(() => expect(panel.shadowRoot?.textContent).toContain("Read only"));
    await userEvent.click(
      panel.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Select line 5"]')!,
    );
    await panel.updateComplete;
    expect(panel.shadowRoot!.querySelector(".selection-tools, textarea")).toBeNull();
  },
};
