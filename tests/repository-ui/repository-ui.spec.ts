import { test, expect } from "playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test.beforeEach(async ({ page }) => {
  await page.goto("/examples/repository-ui/");
  await page.waitForFunction(() => (window as any).fixtureReady);
});

test("original immutable reorder invariants preserve source/draft object identity", async ({
  page,
}) => {
  expect(
    await page.evaluate(() => {
      const { reorderFileTabs } = (window as any).fixture.ui;
      const tabs = ["a", "b", "c"].map((id) => ({
        id,
        label: id,
        description: id,
        draft: `draft-${id}`,
      }));
      const reordered = reorderFileTabs(tabs, "c", "a");
      return {
        ids: reordered.map((tab: any) => tab.id),
        original: tabs.map((tab) => tab.id),
        objects: reordered[0] === tabs[2] && reordered[1] === tabs[0],
        forward: reorderFileTabs(tabs, "a", "c").map((tab: any) => tab.id),
        end: reorderFileTabs(tabs, "a", null).map((tab: any) => tab.id),
        stale:
          reorderFileTabs(tabs, "missing", "a") === tabs &&
          reorderFileTabs(tabs, "a", "missing") === tabs &&
          reorderFileTabs(tabs, "a", "a") === tabs,
        empty: reorderFileTabs([], "a", null).length,
      };
    }),
  ).toEqual({
    ids: ["c", "a", "b"],
    original: ["a", "b", "c"],
    objects: true,
    forward: ["b", "a", "c"],
    end: ["b", "c", "a"],
    stale: true,
    empty: 0,
  });
});

test("tabs rove, close to survivor, reorder from keyboard and retain host content", async ({
  page,
}) => {
  const tabs = page.locator("cw-file-tabs");
  await tabs.getByRole("tab").first().focus();
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab").last()).toBeFocused();
  await page.evaluate(() => {
    (window as any).savedTabContent = document.querySelector("#tab-content");
  });
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await expect(tabs.getByRole("tab").nth(2)).toHaveAttribute("aria-label", "tests/reader.test.ts");
  await expect(tabs.getByRole("tab").nth(2)).toBeFocused();
  await expect(tabs.locator('[aria-live="polite"]')).toContainText("position 3 of 4");
  expect(
    await page.evaluate(
      () => (window as any).savedTabContent === document.querySelector("#tab-content"),
    ),
  ).toBe(true);
  await page.keyboard.press("Delete");
  await expect(tabs.getByRole("tab", { selected: true })).toBeFocused();
  for (let remaining = 2; remaining >= 0; remaining--) {
    await expect(tabs.getByRole("tab", { selected: true })).toBeFocused();
    await page.keyboard.press("Delete");
    await expect(tabs.getByRole("tab")).toHaveCount(remaining);
  }
  await expect(tabs).toBeFocused();
  await expect(tabs.getByRole("tab")).toHaveCount(0);
});

test("mouse drag commits reorder and touch labels retain native pan-x", async ({ page }) => {
  const tabs = page.locator("cw-file-tabs");
  const first = await tabs.getByRole("tab").first().boundingBox();
  const last = await tabs.getByRole("tab").last().boundingBox();
  await page.mouse.move(first!.x + first!.width / 2, first!.y + 12);
  await page.mouse.down();
  await page.mouse.move(last!.x + last!.width, last!.y + 12, { steps: 12 });
  await page.mouse.up();
  await expect(tabs.getByRole("tab").last()).toHaveAttribute("aria-label", "README.md");
  expect(
    await tabs
      .getByRole("tab")
      .first()
      .evaluate((el) => getComputedStyle(el).touchAction),
  ).toBe("pan-x");
  expect(
    await tabs
      .locator(".file-tab-grip")
      .first()
      .evaluate((el) => getComputedStyle(el).touchAction),
  ).toBe("none");
});

test("canceling drag and changing tabs during drag cannot commit obsolete positions", async ({
  page,
}) => {
  const first = await page.locator("cw-file-tabs").getByRole("tab").first().boundingBox();
  await page.mouse.move(first!.x + 20, first!.y + 15);
  await page.mouse.down();
  await page.mouse.move(first!.x + 250, first!.y + 15);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("cw-file-tabs").getByRole("tab").first()).toHaveAttribute(
    "aria-label",
    "README.md",
  );
  await page.mouse.move(first!.x + 20, first!.y + 15);
  await page.mouse.down();
  await page.mouse.move(first!.x + 250, first!.y + 15);
  await page.evaluate(async () => {
    const { tabs } = (window as any).fixture;
    tabs.tabs = tabs.tabs.slice(1);
    await tabs.updateComplete;
  });
  await page.mouse.up();
  await expect(page.locator("cw-file-tabs").getByRole("tab").first()).toHaveAttribute(
    "aria-label",
    "src/index.ts",
  );
});

test("preview reads are scoped, publish immutable snapshots and reject mismatched identities", async ({
  page,
}) => {
  expect(
    await page.evaluate(async () => {
      const f = (window as any).fixture;
      let done: any;
      const calls: any[] = [];
      const controller = new f.ui.SourcePreviewController({
        preview: (file: any) => {
          calls.push(file);
          return new Promise((resolve) => {
            done = resolve;
          });
        },
      });
      await controller.open("", { ...f.scope, path: "ignored" });
      const pending = controller.open("a", { ...f.scope, path: "file" });
      const initial = controller.state;
      done({ ref: f.scope.ref, path: "file", content: "text", binary: false, truncated: false });
      await pending;
      const ready = controller.state;
      const bad = controller.open("a", { ...f.scope, path: "bad" });
      done({ ref: "wrong", path: "bad", content: "text", binary: false, truncated: false });
      await bad;
      return {
        calls: calls.length,
        first: calls[0],
        initialStatus: initial.status,
        immutable: Object.isFrozen(initial) && initial !== ready,
        ready: ready.status,
        mismatch: controller.state.error,
      };
    }),
  ).toMatchObject({
    calls: 2,
    first: { repositoryId: "fixture-repository", ref: "snapshot-001", path: "file" },
    initialStatus: "loading",
    immutable: true,
    ready: "ready",
    mismatch: "Preview returned a different source identity.",
  });
});

test("late previews cannot replace newer paths, closed surfaces, disposed or replaced clients", async ({
  page,
}) => {
  expect(
    await page.evaluate(async () => {
      const f = (window as any).fixture;
      let resolve: any;
      const result = (file: any) => ({
        ref: file.ref,
        path: file.path,
        content: file.path,
        binary: false,
        truncated: false,
      });
      const controller = new f.ui.SourcePreviewController({
        preview: (file: any) =>
          file.path === "old"
            ? new Promise((done) => {
                resolve = () => done(result(file));
              })
            : Promise.resolve(result(file)),
      });
      const old = controller.open("one", { ...f.scope, path: "old" });
      await controller.open("one", { ...f.scope, path: "new" });
      resolve();
      await old;
      const path = controller.state.file.path;
      const closed = controller.open("two", { ...f.scope, path: "old" });
      controller.close();
      resolve();
      await closed;
      const closedState = controller.state;
      const replacing = controller.open("two", { ...f.scope, path: "old" });
      controller.setClient(f.previewClient);
      resolve();
      await replacing;
      const replacedState = controller.state;
      const disposed = controller.open("two", { ...f.scope, path: "final" });
      controller.dispose();
      await disposed;
      return { path, closedState, replacedState, disposedState: controller.state };
    }),
  ).toEqual({ path: "new", closedState: null, replacedState: null, disposedState: null });
});

test("inactive completion stays in its own surface without notifying current reader", async ({
  page,
}) => {
  expect(
    await page.evaluate(async () => {
      const f = (window as any).fixture;
      let resolve: any;
      const controller = new f.ui.SourcePreviewController({
        preview: (file: any) =>
          file.path === "old"
            ? new Promise((done) => {
                resolve = () =>
                  done({
                    ref: file.ref,
                    path: file.path,
                    content: "old",
                    binary: false,
                    truncated: false,
                  });
              })
            : f.previewClient.preview(file),
      });
      const old = controller.open("one", { ...f.scope, path: "old" });
      await controller.open("two", { ...f.scope, path: "new" });
      let changes = 0;
      controller.addEventListener("change", () => changes++);
      resolve();
      await old;
      const active = controller.state.file.path;
      const inactiveChanges = changes;
      controller.selectSurface("one");
      return { active, inactiveChanges, restored: controller.state.preview.content };
    }),
  ).toEqual({ active: "new", inactiveChanges: 0, restored: "old" });
});

test("binary, empty, truncated facts and explicit refresh retain ready scroll only", async ({
  page,
}) => {
  expect(
    await page.evaluate(async () => {
      const f = (window as any).fixture;
      const controller = new f.ui.SourcePreviewController({
        preview: async (file: any) => ({
          ref: file.ref,
          path: file.path,
          content: "",
          binary: file.path === "binary",
          truncated: true,
        }),
      });
      await controller.open("a", { ...f.scope, path: "binary" });
      const binary = controller.state.preview.binary;
      await controller.open("a", { ...f.scope, path: "empty" });
      controller.rememberScroll(120);
      const ready = controller.state;
      const refreshing = controller.refresh();
      controller.rememberScroll(0);
      await refreshing;
      return {
        binary,
        content: controller.state.preview.content,
        truncated: controller.state.preview.truncated,
        scroll: controller.state.scrollTop,
        readyScroll: ready.scrollTop,
      };
    }),
  ).toEqual({ binary: true, content: "", truncated: true, scroll: 120, readyScroll: 120 });
});

test("preview failure retains retry identity and raw source stays literal without highlighting", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const f = (window as any).fixture;
    let calls = 0;
    f.controller.setClient({
      preview: async (file: any) => {
        if (++calls === 1) throw new Error("Fixture unavailable");
        return {
          ...file,
          content: "<script>window.untrusted = true</script>",
          binary: false,
          truncated: false,
        };
      },
    });
    await f.controller.open("a", { ...f.scope, path: "literal.txt" });
  });
  await expect(page.locator("cw-source-preview").getByRole("alert")).toContainText(
    "Fixture unavailable",
  );
  await page.locator("cw-source-preview").getByRole("button", { name: "Refresh" }).click();
  await expect(page.locator("cw-source-preview").getByRole("document")).toContainText(
    "<script>window.untrusted = true</script>",
  );
  expect(await page.evaluate(() => (window as any).untrusted)).toBeUndefined();
});

test("preview copy uses displayed source only and suppresses late status on another identity", async ({
  page,
}) => {
  await page.evaluate(() => {
    const f = (window as any).fixture;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          f.copied = text;
          return new Promise((resolve) => {
            f.finishCopy = resolve;
          });
        },
      },
    });
  });
  await page
    .locator("cw-source-preview")
    .getByRole("button", { name: "Copy displayed preview", exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).fixture.copied)).toContain("Synthetic source");
  await page.evaluate(async () => {
    const f = (window as any).fixture;
    await f.controller.open("reader", { ...f.scope, path: "other" });
    f.finishCopy();
  });
  await expect(page.locator("cw-source-preview").locator('[part="copy-status"]')).toHaveText("");
});

test("picker is native modal, bounded, distinguishes notices and returns pinned identity", async ({
  page,
}) => {
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.picker.client = {
      search: async (scope: any) => ({
        ref: scope.ref,
        paths: Array.from({ length: 105 }, (_, i) => `file-${i}.txt`),
        truncated: false,
        incomplete: true,
      }),
    };
  });
  await page.getByRole("button", { name: "Find file", exact: true }).click();
  const picker = page.locator("cw-file-picker");
  await expect(picker.getByRole("option")).toHaveCount(100);
  await expect(picker.getByRole("dialog")).toBeVisible();
  expect(await picker.locator("dialog").evaluate((el) => el.matches(":modal"))).toBe(true);
  await expect(picker.getByRole("combobox")).toBeFocused();
  await expect(picker.getByRole("status")).toContainText("More matches—refine query");
  await expect(picker.getByRole("status")).toContainText("results may be incomplete");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(picker.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("#intent")).toContainText('"ref":"snapshot-001","path":"file-1.txt"');
  await expect(page.getByRole("button", { name: "Find file", exact: true })).toBeFocused();
});

test("picker query, client, scope and ref fences reject stale answers and stale clicks", async ({
  page,
}) => {
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.requests = [];
    f.picker.client = {
      search: (scope: any, query: string) =>
        new Promise((resolve) => f.requests.push({ scope, query, resolve })),
    };
    f.picker.open = true;
  });
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.locator("cw-file-picker").getByRole("combobox").fill("new");
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.requests[1].resolve({
      ref: f.scope.ref,
      paths: ["new.txt"],
      truncated: false,
      incomplete: false,
    });
    f.requests[0].resolve({
      ref: f.scope.ref,
      paths: ["obsolete.txt"],
      truncated: false,
      incomplete: false,
    });
  });
  await expect(page.locator("cw-file-picker").getByRole("option")).toHaveText("new.txtnew.txt");
  await page.evaluate(() => {
    const f = (window as any).fixture;
    // This click happens before Lit's property-change update; action fences must be synchronous.
    f.picker.scope = { repositoryId: "other", ref: "snapshot-002" };
    f.picker.shadowRoot.querySelector('[role="option"]').click();
  });
  await expect(page.locator("#intent")).toHaveText("No host-owned file-open intent yet.");
  await page.waitForFunction(() => (window as any).fixture.requests.length === 3);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.requests[2].resolve({
      ref: f.scope.ref,
      paths: ["wrong-ref.txt"],
      truncated: false,
      incomplete: false,
    });
  });
  await expect(page.locator("cw-file-picker").getByRole("alert")).toContainText(
    "different snapshot",
  );
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.picker.client = {
      search: async (scope: any) => ({
        ref: scope.ref,
        paths: ["new-client.txt"],
        truncated: false,
        incomplete: false,
      }),
    };
  });
  await expect(page.locator("cw-file-picker").getByRole("option")).toContainText("new-client.txt");
});

test("picker close/disconnect invalidates pending responses; reconnect is usable", async ({
  page,
}) => {
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.requests = [];
    f.picker.client = {
      search: (scope: any) => new Promise((resolve) => f.requests.push({ scope, resolve })),
    };
    f.picker.open = true;
  });
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.requests[0].resolve({
      ref: f.scope.ref,
      paths: ["late"],
      truncated: false,
      incomplete: false,
    });
  });
  await expect(page.locator("cw-file-picker").getByRole("dialog")).not.toBeVisible();
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.picker.open = true;
  });
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.picker.remove();
    document.body.append(f.picker);
  });
  await page.waitForFunction(() => (window as any).fixture.requests.length === 3);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.requests[1].resolve({
      ref: f.scope.ref,
      paths: ["late"],
      truncated: false,
      incomplete: false,
    });
    f.requests[2].resolve({
      ref: f.scope.ref,
      paths: ["reconnected"],
      truncated: false,
      incomplete: false,
    });
  });
  await expect(page.locator("cw-file-picker").getByRole("option")).toContainText("reconnected");
});

test("tree loads only expanded directories and emits immutable host-owned open intent", async ({
  page,
}) => {
  const tree = page.locator("cw-repository-tree");
  await expect(tree.getByRole("button", { name: "README.md", exact: true })).toBeVisible();
  await expect(tree.getByRole("button", { name: "index.ts", exact: true })).toHaveCount(0);
  await tree.locator("summary").first().click();
  await expect(tree.getByRole("button", { name: "index.ts", exact: true })).toBeVisible();
  await tree.getByRole("button", { name: "README.md", exact: true }).click();
  await expect(page.locator("#intent")).toContainText('"path":"README.md"');
  expect(await page.evaluate(() => (window as any).fixture.controller.state.file.path)).toBe(
    "src/index.ts",
  );
  // The preview remains its original truncated fixture, i.e. open intent did not trigger a read.
  await expect(page.locator("cw-source-preview")).toContainText("Preview truncated");
});

test("tree ref/client fences, duplicate identities, error retry and incompleteness stay factual", async ({
  page,
}) => {
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.requests = [];
    f.tree.client = {
      children: (scope: any) => new Promise((resolve) => f.requests.push({ scope, resolve })),
    };
  });
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.tree.scope = { ...f.scope, ref: "new-snapshot" };
  });
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.requests[0].resolve({
      ref: f.scope.ref,
      entries: [{ path: "old", name: "old", kind: "file" }],
      truncated: false,
      incomplete: false,
    });
    f.requests[1].resolve({
      ref: "new-snapshot",
      entries: [
        { path: "a", name: "a", kind: "file" },
        { path: "a", name: "a", kind: "file" },
      ],
      truncated: false,
      incomplete: false,
    });
  });
  const tree = page.locator("cw-repository-tree");
  await expect(tree.getByRole("alert")).toContainText("duplicate or non-child");
  await tree.getByRole("button", { name: "Retry listing" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 3);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.requests[2].resolve({
      ref: "new-snapshot",
      entries: [{ path: "a", name: "a", kind: "file" }],
      truncated: true,
      incomplete: true,
    });
  });
  await expect(tree).toContainText("listing truncated");
  await expect(tree).toContainText("results may be incomplete");
  await expect(tree.getByRole("button", { name: "old", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.tree.client = {
      children: async (scope: any) => ({
        ref: scope.ref,
        entries: [],
        truncated: false,
        incomplete: false,
      }),
    };
    f.tree.shadowRoot.querySelector('[part="file"]').click();
  });
  await expect(page.locator("#intent")).toHaveText("No host-owned file-open intent yet.");
  await expect(tree).toContainText("Empty directory");
});

test("tree and preview enforce client-side display budgets", async ({ page }) => {
  await page.evaluate(async () => {
    const f = (window as any).fixture;
    f.tree.client = {
      children: async (scope: any) => ({
        ref: scope.ref,
        entries: Array.from({ length: 150 }, (_, i) => ({
          path: `file-${i}`,
          name: `file-${i}`,
          kind: "file",
        })),
        truncated: false,
        incomplete: false,
      }),
    };
    f.controller.setClient({
      preview: async (file: any) => ({
        ...file,
        content: "x".repeat(f.ui.SOURCE_PREVIEW_MAX_CHARS + 1),
        binary: false,
        truncated: false,
      }),
    });
    await f.controller.open("budget", { ...f.scope, path: "big" });
  });
  await expect(page.locator("cw-repository-tree").locator('[part="file"]')).toHaveCount(100);
  await expect(page.locator("cw-repository-tree")).toContainText("listing truncated");
  expect(
    await page.evaluate(() => (window as any).fixture.controller.state.preview.content.length),
  ).toBe(256 * 1024);
  await expect(page.locator("cw-source-preview")).toContainText("Preview truncated");
});

for (const theme of ["light", "dark"] as const) {
  for (const size of [
    { name: "wide", width: 1280 },
    { name: "narrow", width: 390 },
  ]) {
    test(`screenshots: ${theme} ${size.name}, all four actual components`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.setViewportSize({ width: size.width, height: 1000 });
      const directory = fileURLToPath(new URL("./screenshots/", import.meta.url));
      await mkdir(directory, { recursive: true });
      await page.locator("cw-repository-tree summary").first().click();
      await expect(
        page.locator("cw-repository-tree").getByRole("button", { name: "index.ts", exact: true }),
      ).toBeVisible();
      for (const [name, selector] of [
        ["tabs", "#tabs-card"],
        ["tree", "#tree-card"],
        ["preview", "#preview-card"],
      ]) {
        await page
          .locator(selector)
          .screenshot({ path: `${directory}${name}-${theme}-${size.name}.png` });
      }
      await page.getByRole("button", { name: "Find file", exact: true }).click();
      await expect(page.locator("cw-file-picker").getByRole("option")).toHaveCount(4);
      await page
        .locator("cw-file-picker dialog")
        .screenshot({ path: `${directory}picker-${theme}-${size.name}.png` });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }
}
