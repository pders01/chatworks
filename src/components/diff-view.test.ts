import { afterEach, expect, test } from "bun:test";
import { CwDiffView } from "./diff-view.js";

afterEach(() => {
  document.body.replaceChildren();
});

test("split diff rows do not preserve Lit template indentation", async () => {
  const diff = new CwDiffView();
  diff.split = true;
  diff.rawDiff = `diff --git a/file.ts b/file.ts
index 1111111..2222222 100644
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new
`;
  document.body.append(diff);

  let sides: NodeListOf<HTMLTableCellElement> | undefined;
  for (let attempt = 0; attempt < 100 && !sides?.length; attempt += 1) {
    await diff.updateComplete;
    sides = diff.shadowRoot?.querySelectorAll<HTMLTableCellElement>(".side");
    if (!sides?.length) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  expect(sides?.[0]?.textContent).toBe("diff --git a/file.ts b/file.ts");
  expect(sides?.[1]?.textContent).toBe("diff --git a/file.ts b/file.ts");
});
