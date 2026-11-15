import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import "@jpahd/chatworks/repository-ui";
import { scope, searchClient, type ReadState } from "./fixtures/repository-ui.js";

type Args = { state: ReadState };
const meta = {
  title: "Repository/Experimental source reading/File picker",
  component: "cw-file-picker",
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
          "Optional /repository-ui primitive. Bounded asynchronous filename search in a native dialog; the host handles file-open intent.",
      },
    },
  },
  render: ({ state }: Args) => html` <main class="story-frame constrained">
    <div class="story-stack">
      <h1>Find a snapshot file</h1>
      <p>Synthetic injected search. Enter opens a selection; Escape closes the native dialog.</p>
      <div class="story-controls">
        <button
          type="button"
          @click=${(event: Event) => {
            const picker = (event.currentTarget as HTMLElement)
              .closest("main")!
              .querySelector("cw-file-picker")!;
            picker.open = true;
          }}
        >
          Find file
        </button>
      </div>
      <output id="file-intent">No file intent yet.</output>
      <cw-file-picker
        .scope=${state === "unbound" ? undefined : scope}
        .client=${state === "unbound" ? undefined : searchClient(state)}
        @cw:file-open=${(event: HTMLElementEventMap["cw:file-open"]) => {
          const output = (event.currentTarget as HTMLElement)
            .closest("main")!
            .querySelector("output")!;
          output.textContent = `Open intent: ${event.detail.path} · ${event.detail.ref}`;
        }}
      ></cw-file-picker>
    </div>
  </main>`,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
async function open(canvas: HTMLElement) {
  await userEvent.click(canvas.querySelector("button")!);
  const picker = canvas.querySelector("cw-file-picker")!;
  await picker.updateComplete;
  return picker;
}
function stateStory(state: ReadState, expected: string): Story {
  return {
    args: { state },
    play: async ({ canvasElement }) => {
      const picker = await open(canvasElement);
      await waitFor(() => expect(picker.shadowRoot?.textContent).toContain(expected));
    },
  };
}
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const picker = await open(canvasElement);
    const intent = fn();
    picker.addEventListener("cw:file-open", intent, { once: true });
    const input = picker.shadowRoot!.querySelector("input")!;
    await userEvent.type(input, "water");
    await waitFor(() =>
      expect(picker.shadowRoot!.querySelectorAll('[role="option"]').length).toBe(1),
    );
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(intent).toHaveBeenCalledOnce());
    expect(intent.mock.calls[0][0].detail).toEqual({ ...scope, path: "src/water.ts" });
    expect(picker.open).toBe(false);
    expect(canvasElement.querySelector("output")!.textContent).toContain("src/water.ts");
  },
};
export const Unbound = stateStory("unbound", "Choose a repository snapshot to search.");
export const Loading = stateStory("loading", "Searching…");
export const Empty = stateStory("empty", "No files found.");
export const Error = stateStory("error", "Synthetic snapshot unavailable.");
export const Bounded = stateStory("bounded", "Listing budget reached; results may be incomplete.");
