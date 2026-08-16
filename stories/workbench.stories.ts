import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { LitElement, css, html } from "lit";
import { state } from "lit/decorators.js";
import { CwCommandPalette } from "../src/components/command-palette.js";
import { CwWorkbenchSwitcher } from "../src/components/workbench-switcher.js";
import { CwWorkbenchView } from "../src/components/workbench-view.js";
import { WorkbenchRegistry } from "../src/lib/workbench.js";

void CwCommandPalette;
void CwWorkbenchSwitcher;
void CwWorkbenchView;

class StoryProjectBoard extends LitElement {
  @state() private cards = [
    { title: "Define extension contract", column: "Done" },
    { title: "Build Storybook", column: "Doing" },
    { title: "Dogfood a project workflow", column: "Next" },
    { title: "Add extension reload", column: "Next" },
  ];

  private addCard(): void {
    this.cards = [...this.cards, { title: "New assistant task", column: "Next" }];
  }

  override render() {
    const columns = ["Next", "Doing", "Done"];
    return html`
      <header>
        <div>
          <span class="eyebrow">project workflow</span>
          <h1>Chatworks roadmap</h1>
        </div>
        <button @click=${this.addCard}>+ task</button>
      </header>
      <main>
        ${columns.map(
          (column) => html`
            <section>
              <h2>
                ${column}<span>${this.cards.filter((card) => card.column === column).length}</span>
              </h2>
              <div class="cards">
                ${this.cards
                  .filter((card) => card.column === column)
                  .map(
                    (card) => html`<article>
                      <strong>${card.title}</strong>
                      <small>${column === "Doing" ? "assistant + maintainer" : "maintainer"}</small>
                    </article>`,
                  )}
              </div>
            </section>
          `,
        )}
      </main>
    `;
  }

  static override styles = css`
    :host {
      display: block;
      min-height: 100%;
      padding: clamp(1rem, 3vw, 2rem);
      color: var(--text);
      background: var(--surface-1);
      font-family: var(--font-sans);
    }
    header,
    main,
    h2 {
      display: flex;
    }
    header {
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    h1 {
      margin: 0.2rem 0 0;
      font-size: clamp(1.25rem, 3vw, 2rem);
      letter-spacing: -0.04em;
    }
    .eyebrow,
    small {
      color: var(--text-muted);
      font: var(--text-xs) var(--font-mono);
    }
    .eyebrow {
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    button {
      padding: 0.55rem 0.8rem;
      border: 1px solid var(--border-accent);
      border-radius: var(--radius-sm);
      color: var(--text);
      background: var(--surface-2);
      font: inherit;
      cursor: pointer;
    }
    main {
      align-items: flex-start;
      gap: 0.8rem;
      overflow: auto;
    }
    section {
      flex: 1 0 220px;
      min-height: 22rem;
      padding: 0.75rem;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      background: var(--surface-0);
    }
    h2 {
      align-items: center;
      justify-content: space-between;
      margin: 0 0 0.75rem;
      color: var(--text-secondary);
      font-size: 0.78rem;
      font-weight: 600;
    }
    h2 span {
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    .cards {
      display: grid;
      gap: 0.55rem;
    }
    article {
      display: grid;
      gap: 0.7rem;
      padding: 0.8rem;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: var(--surface-1);
      box-shadow: 0 3px 12px rgb(0 0 0 / 0.08);
    }
    article strong {
      font-size: 0.82rem;
      line-height: 1.4;
    }
  `;
}

class StoryWorkflowCanvas extends LitElement {
  override render() {
    return html`
      <div class="canvas">
        <article class="node source"><small>context</small><strong>Project state</strong></article>
        <span class="edge first"></span>
        <article class="node agent">
          <small>assistant</small><strong>Plan next action</strong>
        </article>
        <span class="edge second"></span>
        <article class="node output"><small>workflow</small><strong>Update board</strong></article>
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: grid;
      min-height: 100%;
      place-items: center;
      overflow: auto;
      color: var(--text);
      background-color: var(--surface-1);
      background-image: radial-gradient(var(--surface-4) 1px, transparent 1px);
      background-size: 20px 20px;
      font-family: var(--font-sans);
    }
    .canvas {
      position: relative;
      display: grid;
      grid-template-columns: repeat(3, minmax(150px, 210px));
      gap: 4rem;
      align-items: center;
      padding: 4rem;
    }
    .node {
      position: relative;
      z-index: 1;
      display: grid;
      gap: 0.35rem;
      padding: 1rem;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface-1);
      box-shadow: var(--shadow-dropdown);
    }
    .node.agent {
      border-color: var(--accent-assistant);
    }
    small {
      color: var(--text-muted);
      font: var(--text-xs) var(--font-mono);
      text-transform: uppercase;
    }
    strong {
      font-size: 0.88rem;
    }
    .edge {
      position: absolute;
      top: 50%;
      width: 4rem;
      height: 1px;
      background: var(--border-accent);
    }
    .edge::after {
      position: absolute;
      top: -3px;
      right: 0;
      width: 6px;
      height: 6px;
      border-top: 1px solid var(--border-accent);
      border-right: 1px solid var(--border-accent);
      content: "";
      transform: rotate(45deg);
    }
    .first {
      left: calc(33.333% - 2rem);
    }
    .second {
      left: calc(66.666% - 2rem);
    }
  `;
}

class StoryWorkbench extends LitElement {
  private readonly registry = createRegistry();

  override connectedCallback(): void {
    super.connectedCallback();
    this.registry.addEventListener("cw:workbench-change", this.onRegistryChange);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.registry.removeEventListener("cw:workbench-change", this.onRegistryChange);
  }

  private onRegistryChange = (): void => this.requestUpdate();

  private openPalette(): void {
    this.renderRoot.querySelector<CwCommandPalette>("cw-command-palette")?.show();
  }

  override render() {
    const active = this.registry.activeView();
    return html`
      <header>
        <strong><span>◆</span> workflow lab</strong>
        <cw-workbench-switcher .registry=${this.registry}></cw-workbench-switcher>
        <button @click=${this.openPalette} aria-label="Open command palette">⌘K</button>
      </header>
      <cw-workbench-view .registry=${this.registry} .viewId=${active}></cw-workbench-view>
      <cw-command-palette .registry=${this.registry}></cw-command-palette>
    `;
  }

  static override styles = css`
    :host {
      display: grid;
      grid-template-rows: 2.6rem minmax(0, 1fr);
      width: 100%;
      height: 760px;
      overflow: hidden;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      background: var(--surface-1);
      box-shadow: var(--shadow-dropdown);
    }
    header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 1rem;
      padding: 0 0.7rem;
      border-bottom: 1px solid var(--border-default);
      background: var(--surface-0);
      font-family: var(--font-sans);
    }
    header strong {
      font-size: 0.78rem;
    }
    header strong span {
      color: var(--accent-assistant);
    }
    header > button {
      justify-self: end;
      padding: 0.25rem 0.45rem;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      background: var(--surface-1);
      font: var(--text-xs) var(--font-mono);
      cursor: pointer;
    }
    cw-workbench-view {
      min-width: 0;
      min-height: 0;
    }
  `;
}

if (!customElements.get("cw-story-project-board")) {
  customElements.define("cw-story-project-board", StoryProjectBoard);
}
if (!customElements.get("cw-story-workflow-canvas")) {
  customElements.define("cw-story-workflow-canvas", StoryWorkflowCanvas);
}
if (!customElements.get("cw-story-workbench")) {
  customElements.define("cw-story-workbench", StoryWorkbench);
}

function createRegistry(): WorkbenchRegistry {
  const registry = new WorkbenchRegistry();
  registry.registerView({
    id: "story.board",
    title: "Board",
    icon: "▦",
    order: 10,
    mount(container) {
      container.append(document.createElement("cw-story-project-board"));
    },
  });
  registry.registerView({
    id: "story.canvas",
    title: "Canvas",
    icon: "◇",
    order: 20,
    mount(container) {
      container.append(document.createElement("cw-story-workflow-canvas"));
    },
  });
  registry.registerCommand({
    id: "story.open-board",
    title: "Open project board",
    category: "Workflow",
    run() {
      registry.openView("story.board");
    },
  });
  registry.registerCommand({
    id: "story.open-canvas",
    title: "Open workflow canvas",
    category: "Workflow",
    run() {
      registry.openView("story.canvas");
    },
  });
  registry.contribute("assistant.context", {
    id: "story.project-context",
    value: { label: "Project state", source: "board" },
  });
  registry.openView("story.board");
  return registry;
}

const meta = {
  title: "Workflows/Extension workbench",
  component: "cw-story-workbench",
  parameters: {
    docs: {
      description: {
        component:
          "A composed workbench using only public Chatworks APIs. Switch between an extension-owned board and canvas, or open the command palette with the header button.",
      },
    },
  },
  render: () => html`<div class="story-frame"><cw-story-workbench></cw-story-workbench></div>`,
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const BoardAndCanvas: Story = {};
