import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { LitElement, css, html } from "lit";
import { state } from "lit/decorators.js";
import { expect, userEvent, waitFor } from "storybook/test";
import "@jpahd/chatworks/command-palette";
import "@jpahd/chatworks/workbench-switcher";
import "@jpahd/chatworks/workbench-view";
import { WorkbenchRegistry } from "@jpahd/chatworks/workbench";

const contentStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    min-inline-size: 0;
    padding: 1rem;
    color: CanvasText;
    background: Canvas;
    font: 1rem/1.5 system-ui;
  }
  h1 {
    font-size: 1.4rem;
    margin-block: 0 1rem;
  }
  h2 {
    font-size: 1rem;
  }
  button {
    min-block-size: 2rem;
    font: inherit;
  }
`;
class StoryProjectBoard extends LitElement {
  @state() private cards = [
    { title: "Choose native seeds", column: "Done" },
    { title: "Prepare raised beds", column: "Doing" },
    { title: "Plan watering rota", column: "Next" },
    { title: "Schedule harvest day", column: "Next" },
  ];
  override render() {
    return html`<header>
        <h1>Community garden board</h1>
        <button
          type="button"
          @click=${() => {
            this.cards = [...this.cards, { title: "New garden task", column: "Next" }];
          }}
        >
          Add task
        </button>
      </header>
      <div class="columns">
        ${["Next", "Doing", "Done"].map(
          (column) => html`<section>
            <h2>${column} (${this.cards.filter((card) => card.column === column).length})</h2>
            <ul>
              ${this.cards
                .filter((card) => card.column === column)
                .map((card) => html`<li>${card.title}</li>`)}
            </ul>
          </section>`,
        )}
      </div>`;
  }
  static override styles = [
    contentStyles,
    css`
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: start;
        justify-content: space-between;
        gap: 1rem;
      }
      .columns {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
        gap: 1rem;
        margin-block-start: 1rem;
      }
      section {
        border: 1px solid GrayText;
        border-radius: 0.25rem;
        padding: 0.75rem;
      }
      h2 {
        margin-block-start: 0;
      }
      ul {
        padding-inline-start: 1.25rem;
      }
      li + li {
        margin-block-start: 0.75rem;
      }
    `,
  ];
}
class StoryWorkflowCanvas extends LitElement {
  override render() {
    return html`<h1>Garden planning canvas</h1>
      <p>Consumer-owned workflow illustration; not a library canvas editor.</p>
      <ol>
        <li><small>Context</small><strong>Weather and soil</strong></li>
        <li><small>Planning</small><strong>Choose planting dates</strong></li>
        <li><small>Outcome</small><strong>Update garden board</strong></li>
      </ol>`;
  }
  static override styles = [
    contentStyles,
    css`
      ol {
        display: flex;
        flex-wrap: wrap;
        gap: 2rem;
        padding-inline-start: 1.5rem;
      }
      li {
        flex: 1 1 10rem;
        padding: 1rem;
        border: 1px solid GrayText;
        border-radius: 0.25rem;
      }
      small,
      strong {
        display: block;
      }
    `,
  ];
}
class StoryWorkbench extends LitElement {
  private readonly registry = createRegistry();
  override connectedCallback(): void {
    super.connectedCallback();
    this.registry.addEventListener("cw:workbench-change", this.onRegistryChange);
  }
  override disconnectedCallback(): void {
    this.registry.removeEventListener("cw:workbench-change", this.onRegistryChange);
    super.disconnectedCallback();
  }
  private onRegistryChange = (): void => this.requestUpdate();
  override render() {
    return html`<header>
        <strong>Garden workspace</strong>
        <cw-workbench-switcher .registry=${this.registry}></cw-workbench-switcher>
        <button
          type="button"
          @click=${() => this.renderRoot.querySelector("cw-command-palette")?.show()}
        >
          Commands
        </button>
      </header>
      <cw-workbench-view
        .registry=${this.registry}
        .viewId=${this.registry.activeView()}
      ></cw-workbench-view>
      <cw-command-palette .registry=${this.registry}></cw-command-palette>`;
  }
  static override styles = css`
    :host {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      inline-size: 100%;
      min-inline-size: 0;
      min-block-size: 36rem;
      border: 1px solid GrayText;
      border-radius: 0.5rem;
      overflow: hidden;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border-block-end: 1px solid GrayText;
    }
    header strong {
      margin-inline-end: auto;
    }
    button {
      min-block-size: 2rem;
      font: inherit;
    }
    cw-workbench-view {
      min-inline-size: 0;
      min-block-size: 0;
    }
  `;
}
if (!customElements.get("cw-story-project-board"))
  customElements.define("cw-story-project-board", StoryProjectBoard);
if (!customElements.get("cw-story-workflow-canvas"))
  customElements.define("cw-story-workflow-canvas", StoryWorkflowCanvas);
if (!customElements.get("cw-story-workbench"))
  customElements.define("cw-story-workbench", StoryWorkbench);

function createRegistry(): WorkbenchRegistry {
  const registry = new WorkbenchRegistry();
  for (const [id, title, tag] of [
    ["story.board", "Board", "cw-story-project-board"],
    ["story.canvas", "Canvas", "cw-story-workflow-canvas"],
  ]) {
    registry.registerView({
      id,
      title,
      mount(container) {
        container.append(document.createElement(tag));
      },
    });
    registry.registerCommand({
      id: `${id}.open`,
      title: `Open ${title.toLowerCase()}`,
      category: "Garden",
      run() {
        registry.openView(id);
      },
    });
  }
  registry.contribute("assistant.context", {
    id: "story.garden-context",
    value: { label: "Garden plan", source: "board" },
  });
  registry.openView("story.board");
  return registry;
}
const meta = {
  title: "Compositions/Extension workbench",
  component: "cw-story-workbench",
  parameters: {
    docs: {
      description: {
        component:
          "Consumer composition using public workbench contracts: registry-owned navigation, commands and extension-owned views. The garden board/canvas content is synthetic, not a Chatworks product or roadmap.",
      },
    },
  },
  render: () => html`<main class="story-frame"><cw-story-workbench></cw-story-workbench></main>`,
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const BoardAndCanvas: Story = {
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector("cw-story-workbench")!.shadowRoot!;
    const view = root.querySelector("cw-workbench-view")!;
    await waitFor(() =>
      expect(view.shadowRoot?.querySelector("cw-story-project-board")).not.toBeNull(),
    );
    const board = view.shadowRoot!.querySelector("cw-story-project-board")!.shadowRoot!;
    await userEvent.click(board.querySelector("button")!);
    await waitFor(() => expect(board.textContent).toContain("New garden task"));
    const switcher = root.querySelector("cw-workbench-switcher")!;
    await userEvent.click(
      [...switcher.shadowRoot!.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Canvas"),
      )!,
    );
    await waitFor(() =>
      expect(view.shadowRoot?.querySelector("cw-story-workflow-canvas")).not.toBeNull(),
    );
  },
};
