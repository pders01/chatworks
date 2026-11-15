import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { CwDiffView } from "@jpahd/chatworks/diff-view";

void CwDiffView;

type DiffArgs = {
  rawDiff: string;
  split: boolean;
  wrap: boolean;
  showMetadata: boolean;
  truncated: boolean;
  emptyLabel: string;
  height: number;
};

const patch = `diff --git a/src/plant.ts b/src/plant.ts
index 47ac92a..8f3be21 100644
--- a/src/plant.ts
+++ b/src/plant.ts
@@ -1,6 +1,9 @@
 export interface PlantingBed {
   name: string;
-  crop: string;
+  crops: readonly string[];
+  season: "spring" | "summer";
 }
${" "}
-export const wateringDays = ["Monday"];
+export const wateringDays = ["Monday", "Thursday"];
+export const harvestDay = "Saturday";
+export const volunteers = 4;
diff --git a/docs/garden-plan.md b/docs/garden-plan.md
new file mode 100644
index 0000000..84aa012
--- /dev/null
+++ b/docs/garden-plan.md
@@ -0,0 +1,4 @@
+# Community garden
+
+Plant leafy greens in spring and herbs in summer.
+Share the watering rota with volunteers.
`;

const meta = {
  title: "Repository/Diff view",
  component: "cw-diff-view",
  parameters: {
    docs: {
      description: {
        component:
          "Transport-independent patch rendering with semantic gutters, word-level changes, optional host-configured highlighting, wrapping, and unified or split layouts.",
      },
    },
  },
  args: {
    rawDiff: patch,
    split: false,
    wrap: false,
    showMetadata: false,
    truncated: false,
    emptyLabel: "no changes",
    height: 680,
  },
  argTypes: {
    rawDiff: { control: "text" },
    split: { control: "boolean" },
    wrap: { control: "boolean" },
    showMetadata: { control: "boolean" },
    truncated: { control: "boolean" },
    emptyLabel: { control: "text" },
    height: { control: { type: "range", min: 220, max: 760, step: 20 } },
  },
  render: (args: DiffArgs) => html`
    <div class="story-frame constrained">
      <div style="width:100%; max-width:980px; min-width:0">
        <p class="story-label">reviewed patch</p>
        <div class="story-panel" style="width:100%; min-width:0; height:${args.height}px">
          <cw-diff-view
            .rawDiff=${args.rawDiff}
            .split=${args.split}
            .wrap=${args.wrap}
            .showMetadata=${args.showMetadata}
            .truncated=${args.truncated}
            .emptyLabel=${args.emptyLabel}
            style="height: 100%"
          ></cw-diff-view>
        </div>
      </div>
    </div>
  `,
} satisfies Meta<DiffArgs>;

export default meta;
type Story = StoryObj<DiffArgs>;

export const Unified: Story = {};

export const Split: Story = {
  args: { split: true },
};

export const Wrapped: Story = {
  args: { wrap: true },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

export const Metadata: Story = {
  args: { showMetadata: true },
};

export const Empty: Story = {
  args: { rawDiff: "", emptyLabel: "working tree is clean", height: 260 },
};

export const Truncated: Story = {
  args: {
    truncated: true,
    height: 420,
  },
};

export const Binary: Story = {
  args: {
    rawDiff: `diff --git a/public/board.png b/public/board.png
new file mode 100644
index 0000000..b128a92
Binary files /dev/null and b/public/board.png differ
`,
    showMetadata: true,
    height: 260,
  },
};
