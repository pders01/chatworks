import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { html } from "lit";
import type { CommitsIntentDetail } from "@jpahd/commits-core/contracts";
import { PortableCommitsReader } from "@jpahd/chatworks/commits-reader";
import { createCommitsFixture, type CommitsFixtureState } from "./fixtures/commits-reader.js";

void PortableCommitsReader;

type Args = { state: CommitsFixtureState; height: number };
const meta = {
  title: "Repository/Experimental source reading/Commits reader",
  component: "portable-commits-reader",
  args: { state: "selected", height: 680 },
  argTypes: {
    state: {
      name: "Fixture state",
      description: "Synthetic injected-client scenario, not a component property.",
      table: { category: "Fixture" },
      control: "select",
      options: [
        "unbound",
        "loading",
        "error",
        "incompatible",
        "empty",
        "loaded",
        "selected",
        "partial",
        "unknown",
        "clipped",
        "plain",
        "detail-error",
      ],
    },
    height: {
      name: "Frame height",
      table: { category: "Fixture" },
      control: { type: "range", min: 320, max: 900, step: 20 },
    },
  },
  render: (args: Args) => {
    const fixture = createCommitsFixture(args.state, { clippedBy: "bytes" });
    return html`<div style="height:${args.height}px; min-width:0; width:100%">
      <portable-commits-reader
        .provider=${fixture.provider}
        .location=${fixture.location}
        .actions=${["return", "explain"]}
        .instanceKey=${"storybook-commits"}
        .exposed=${true}
        @commits-intent=${(event: CustomEvent<CommitsIntentDetail>) => {
          // This fixture host owns navigation; the reader only emits intent.
          const reader = event.currentTarget as PortableCommitsReader;
          if (event.detail.intent.kind === "location")
            reader.location = event.detail.intent.location;
        }}
      ></portable-commits-reader>
    </div>`;
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

function readerIn(canvas: HTMLElement): PortableCommitsReader {
  return canvas.querySelector<PortableCommitsReader>("portable-commits-reader")!;
}
function textIn(canvas: HTMLElement): string {
  return readerIn(canvas).shadowRoot?.textContent ?? "";
}
function stateStory(state: CommitsFixtureState, text: string): Story {
  return {
    args: { state },
    play: async ({ canvasElement }) => {
      await waitFor(() => expect(textIn(canvasElement)).toContain(text));
    },
  };
}

export const Selected: Story = {
  args: { state: "selected" },
  play: async ({ canvasElement }) => {
    const reader = readerIn(canvasElement);
    await waitFor(() =>
      expect(reader.shadowRoot?.querySelector(".commit-title")?.textContent).toBe(
        "Keep repository reads bounded",
      ),
    );
    expect(reader.shadowRoot?.querySelector(".body")?.textContent).toContain(
      "<literal text, not markup>",
    );
    expect(reader.shadowRoot?.querySelector(".body literal")).toBeNull();
    const split = Array.from(reader.shadowRoot!.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Split",
    )!;
    await userEvent.click(split);
    await reader.updateComplete;
    expect(split.getAttribute("aria-pressed")).toBe("true");
    expect(reader.shadowRoot!.querySelector("cw-diff-view")?.split).toBe(true);
  },
};
export const Loaded: Story = {
  args: { state: "loaded" },
  play: async ({ canvasElement }) => {
    const reader = readerIn(canvasElement);
    await waitFor(() => expect(reader.shadowRoot?.querySelector("ol button")).not.toBeNull());
    await userEvent.click(reader.shadowRoot!.querySelector<HTMLButtonElement>("ol button")!);
    await waitFor(() => expect(reader.location?.commit).toBe("a".repeat(40)));
    await waitFor(() => expect(reader.shadowRoot?.querySelector(".commit-title")).not.toBeNull());
    const filter = reader.shadowRoot!.querySelector<HTMLInputElement>("input[type=search]")!;
    await userEvent.type(filter, "no matching commit");
    await waitFor(() => expect(reader.shadowRoot?.querySelectorAll("ol li").length).toBe(0));
  },
};
export const Unbound = stateStory("unbound", "Choose a repository");
export const Loading = stateStory("loading", "Loading commits…");
export const Empty = stateStory("empty", "No commits for this exact path.");
export const ReadError = stateStory("error", "Couldn't load commits");
export const Incompatible = stateStory("incompatible", "then reload this page.");
export const Partial = stateStory("partial", "Backend patch is partial:");
export const Unknown = stateStory("unknown", "Patch completeness is unknown");
export const Clipped = stateStory("clipped", "Reader display limit:");
export const PlainText = stateStory("plain", "Structured diff work limit reached.");
export const DetailError = stateStory("detail-error", "Unable to read this repository.");
