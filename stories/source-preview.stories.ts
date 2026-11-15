import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import { SourcePreviewController } from "@jpahd/chatworks/repository-ui";
import { previewClient, scope, type ReadState } from "./fixtures/repository-ui.js";

type PreviewState = ReadState | "binary";
class StorySourcePreview extends LitElement {
  @property() state: PreviewState = "loaded";
  private controller?: SourcePreviewController;
  protected override willUpdate(changed: Map<string, unknown>): void {
    if (!changed.has("state")) return;
    this.controller?.dispose();
    this.controller = new SourcePreviewController(previewClient(this.state));
    if (this.state !== "unbound")
      void this.controller.open("story", { ...scope, path: "src/plant.ts" });
  }
  override disconnectedCallback(): void {
    this.controller?.dispose();
    super.disconnectedCallback();
  }
  override render() {
    return html`<cw-source-preview
      .controller=${this.controller}
      @cw:source-preview-close=${() => this.controller?.close()}
    ></cw-source-preview>`;
  }
}
if (!customElements.get("cw-story-source-preview"))
  customElements.define("cw-story-source-preview", StorySourcePreview);

type Args = { state: PreviewState };
const meta = {
  title: "Repository/Experimental source reading/Source preview",
  component: "cw-source-preview",
  args: { state: "loaded" },
  argTypes: {
    state: {
      name: "Fixture state",
      description: "Synthetic injected-client scenario, not a component property.",
      table: { category: "Fixture" },
      control: "select",
      options: ["loaded", "unbound", "loading", "empty", "error", "bounded", "binary"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Optional /repository-ui read-only plaintext preview, driven by a scoped SourcePreviewController. Bounded responses copy only displayed text; no annotation or editor semantics.",
      },
    },
  },
  render: ({ state }: Args) => html`<main class="story-frame constrained">
    <div class="story-stack">
      <h1>Read-only source snapshot</h1>
      <p>Refresh and Back operate on the injected controller. Literal markup remains text.</p>
      <cw-story-source-preview .state=${state}></cw-story-source-preview>
    </div>
  </main>`,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
function previewIn(canvas: HTMLElement) {
  return canvas
    .querySelector("cw-story-source-preview")!
    .shadowRoot!.querySelector("cw-source-preview")!;
}
function stateStory(state: PreviewState, text: string): Story {
  return {
    args: { state },
    play: async ({ canvasElement }) => {
      await waitFor(() => expect(previewIn(canvasElement).shadowRoot?.textContent).toContain(text));
    },
  };
}
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(previewIn(canvasElement).shadowRoot?.querySelector("code")?.textContent).toContain(
        "<seedling>",
      ),
    );
    const preview = previewIn(canvasElement);
    expect(preview.shadowRoot!.querySelector("seedling")).toBeNull();
    expect(preview.shadowRoot!.textContent).toContain("Read-only snapshot");
    const intent = fn();
    preview.addEventListener("cw:source-preview-close", intent, { once: true });
    await userEvent.click(
      [...preview.shadowRoot!.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Back",
      )!,
    );
    expect(intent.mock.calls[0][0].detail).toEqual({ ...scope, path: "src/plant.ts" });
    await waitFor(() =>
      expect(preview.shadowRoot!.textContent).toContain("Open a file to preview"),
    );
    await preview.controller!.open("story", { ...scope, path: "src/plant.ts" });
    await waitFor(() =>
      expect(preview.shadowRoot!.querySelector("code")?.textContent).toContain("<seedling>"),
    );
  },
};
export const Unbound = stateStory("unbound", "Open a file to preview");
export const Loading = stateStory("loading", "Loading source…");
export const Empty = stateStory("empty", "Empty text preview.");
export const Error = stateStory("error", "Synthetic snapshot unavailable.");
export const Bounded = stateStory("bounded", "Copy includes only the displayed text.");
export const Binary = stateStory("binary", "Binary file. No text preview available.");
