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

  await settleDiff(diff, ".side");
  const sides = diff.shadowRoot?.querySelectorAll<HTMLTableCellElement>(".side");

  expect(sides?.[0]?.textContent).toBe("diff --git a/file.ts b/file.ts");
  expect(sides?.[1]?.textContent).toBe("diff --git a/file.ts b/file.ts");
});

test("split sides expose change kinds and filler cells as class/part tokens", async () => {
  const diff = new CwDiffView();
  diff.split = true;
  diff.rawDiff = `diff --git a/file.ts b/file.ts
index 1111111..2222222 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,2 @@
 keep
-old
+new
+extra
`;
  document.body.append(diff);

  await settleDiff(diff, ".side");
  const sides = Array.from(
    diff.shadowRoot?.querySelectorAll<HTMLTableCellElement>(".side") ?? [],
  );
  const byPart = (part: string) =>
    sides.filter((cell) => cell.getAttribute("part")?.split(" ").includes(part));

  // Context rows stay structural-only: `side old` / `side new`.
  expect(byPart("deletion")).toHaveLength(1);
  expect(byPart("addition")).toHaveLength(2);
  expect(byPart("filler")).toHaveLength(1);
  expect(byPart("deletion")[0]?.getAttribute("part")).toBe("side old deletion");
  expect(byPart("addition")[0]?.getAttribute("part")).toBe("side new addition");
  expect(byPart("filler")[0]?.getAttribute("part")).toBe("side old filler");
  expect(byPart("filler")[0]?.textContent).toBe("");
});

test("renders binary patches as an explicit non-text state", async () => {
  const diff = new CwDiffView();
  diff.split = true;
  diff.rawDiff = `diff --git a/image.png b/image.png
new file mode 100644
index 0000000..b128a92
Binary files /dev/null and b/image.png differ
`;
  document.body.append(diff);

  await settleDiff(diff, ".binary");

  expect(diff.shadowRoot?.querySelector(".binary")?.textContent).toContain("Binary file changed");
  expect(diff.shadowRoot?.querySelector(".binary")?.textContent).toContain(
    "No text preview is available",
  );
  expect(diff.shadowRoot?.querySelector("table")).toBeNull();
  expect(diff.shadowRoot?.textContent).not.toContain("Binary files /dev/null");
});

test("keeps textual files split when the same patch includes a binary file", async () => {
  const diff = new CwDiffView();
  diff.split = true;
  diff.rawDiff = `diff --git a/image.png b/image.png
new file mode 100644
index 0000000..b128a92
Binary files /dev/null and b/image.png differ
diff --git a/file.ts b/file.ts
index 1111111..2222222 100644
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new
`;
  document.body.append(diff);

  await settleDiff(diff, ".mixed-split table");

  expect(diff.shadowRoot?.querySelector(".binary")?.textContent).toContain("Binary file changed");
  expect(diff.shadowRoot?.querySelector(".mixed-split")?.getAttribute("part")).toContain("split");
  expect(diff.shadowRoot?.querySelector(".split-file")?.textContent).toContain("old");
  expect(diff.shadowRoot?.querySelector(".split-file")?.textContent).toContain("new");
});

test("announces host-owned truncation independently of patch contents", async () => {
  const diff = new CwDiffView();
  diff.truncated = true;
  diff.rawDiff = "@@ -1 +1 @@\n-old\n+new\n";
  document.body.append(diff);

  await settleDiff(diff, ".truncated");

  expect(diff.shadowRoot?.querySelector(".truncated")?.getAttribute("role")).toBe("status");
  expect(diff.shadowRoot?.querySelector(".truncated")?.textContent).toContain(
    "Remaining changes are not shown",
  );
});

async function settleDiff(diff: CwDiffView, selector: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await diff.updateComplete;
    if (diff.shadowRoot?.querySelector(selector)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Diff view did not render ${selector}`);
}
