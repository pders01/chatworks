import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { GcCombobox, type ComboboxOption } from "../src/components/combobox.js";

void GcCombobox;

const modelOptions: ComboboxOption[] = [
  { value: "qwen3-coder", label: "Qwen 3 Coder", description: "Local · 131k context" },
  { value: "claude-sonnet-4", label: "Claude Sonnet 4", description: "Anthropic · reasoning" },
  { value: "gpt-5-mini", label: "GPT-5 mini", description: "OpenAI · low latency" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Google · multimodal" },
];

type ComboboxArgs = {
  options: ComboboxOption[];
  value: string;
  placeholder: string;
  emptyHint: string;
};

const meta = {
  title: "Inputs/Combobox",
  component: "cw-combobox",
  parameters: {
    docs: {
      description: {
        component:
          "Accessible free-form combobox with filtering, descriptions, active-descendant keyboard navigation, and viewport-aware dropdown positioning.",
      },
    },
  },
  args: {
    options: modelOptions,
    value: "",
    placeholder: "Select a model",
    emptyHint: "No models match",
  },
  render: (args: ComboboxArgs) => html`
    <div class="story-frame constrained">
      <div style="width:min(100%, 420px); margin-top: 8rem">
        <p class="story-label">assistant model</p>
        <cw-combobox
          .options=${args.options}
          .value=${args.value}
          .placeholder=${args.placeholder}
          .emptyHint=${args.emptyHint}
        ></cw-combobox>
      </div>
    </div>
  `,
} satisfies Meta<ComboboxArgs>;

export default meta;
type Story = StoryObj<ComboboxArgs>;

async function openCombobox(canvasElement: HTMLElement): Promise<void> {
  const combobox = canvasElement.querySelector<GcCombobox>("cw-combobox");
  if (!combobox) return;
  await combobox.updateComplete;
  combobox.shadowRoot?.querySelector("input")?.focus();
  await combobox.updateComplete;
}

export const Models: Story = {
  play: ({ canvasElement }) => openCombobox(canvasElement),
};

export const Empty: Story = {
  args: {
    options: [],
    value: "unavailable-model",
    emptyHint: "Connect a provider to discover models",
  },
  play: ({ canvasElement }) => openCombobox(canvasElement),
};
