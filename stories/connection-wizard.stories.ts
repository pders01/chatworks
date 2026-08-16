import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { GcConnectionWizard } from "../src/components/connection-wizard.js";
import { createStoryLlmConfigHost } from "./support/story-host.js";
import "./support/story-host.js";

void GcConnectionWizard;

type ConnectionWizardArgs = {
  outcome: "success" | "failure";
};

const meta = {
  title: "AI surfaces/Connection wizard",
  component: "cw-connection-wizard",
  parameters: {
    docs: {
      description: {
        component:
          "Guided provider setup with explicit connection validation, model discovery, and recoverable failure states.",
      },
    },
  },
  args: {
    outcome: "success",
  },
  render: (args: ConnectionWizardArgs) => {
    const llmConfigHost = createStoryLlmConfigHost();
    llmConfigHost.discoverModels = async () =>
      args.outcome === "failure"
        ? { modelIds: [], providerName: "Example AI", error: "Authentication failed (401)" }
        : {
            modelIds: ["example-code", "example-reasoning"],
            providerName: "Example AI",
            error: "",
          };

    return html`
      <cw-story-host .llmConfigHost=${llmConfigHost}>
        <div class="story-frame constrained">
          <cw-connection-wizard></cw-connection-wizard>
        </div>
      </cw-story-host>
    `;
  },
} satisfies Meta<ConnectionWizardArgs>;

export default meta;
type Story = StoryObj<ConnectionWizardArgs>;

async function openConnectionResult(
  canvasElement: HTMLElement,
  outcome: ConnectionWizardArgs["outcome"],
) {
  const wizard = canvasElement.querySelector<GcConnectionWizard>("cw-connection-wizard");
  if (!wizard) throw new Error("Connection wizard did not render");
  await wizard.updateComplete;

  const root = wizard.shadowRoot;
  const baseUrl = root?.querySelector<HTMLInputElement>('input[placeholder^="https://"]');
  if (!baseUrl) throw new Error("Connection URL input did not render");
  baseUrl.value = "https://api.example.test/v1";
  baseUrl.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  await wizard.updateComplete;

  findButton(root, "next").click();
  await wizard.updateComplete;
  findButton(root, "test connection").click();

  const selector = outcome === "failure" ? "[part~='error']" : "[part~='step-body']";
  await waitForState(wizard, selector, (element) =>
    outcome === "failure"
      ? element.textContent?.includes("Authentication failed") === true
      : element.textContent?.includes("Choose a model") === true,
  );
}

function findButton(root: ShadowRoot | null, label: string): HTMLButtonElement {
  const button = [...(root?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Connection wizard button not found: ${label}`);
  return button;
}

async function waitForState(
  wizard: GcConnectionWizard,
  selector: string,
  matches: (element: Element) => boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await Promise.resolve();
    await wizard.updateComplete;
    const element = wizard.shadowRoot?.querySelector(selector);
    if (element && matches(element)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Connection wizard did not reach expected state: ${selector}`);
}

export const ModelsDiscovered: Story = {
  play: ({ canvasElement }) => openConnectionResult(canvasElement, "success"),
};

export const AuthenticationFailure: Story = {
  args: { outcome: "failure" },
  play: ({ canvasElement }) => openConnectionResult(canvasElement, "failure"),
};
