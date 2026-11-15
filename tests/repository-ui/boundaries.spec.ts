import { test, expect } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/examples/repository-ui/");
  await page.waitForFunction(() => (window as any).fixtureReady);
});

test("tablist owns only selections while file actions remain separately accessible", async ({
  page,
}) => {
  const tabs = page.locator("cw-file-tabs");
  const tablist = tabs.getByRole("tablist", { name: "Open files", exact: true });
  const actions = tabs.getByRole("group", { name: "File actions", exact: true });
  await expect(tablist.getByRole("tab")).toHaveCount(4);
  await expect(tablist.locator('button:not([role="tab"])')).toHaveCount(0);
  await expect(tablist.getByRole("group")).toHaveCount(0);
  await expect(actions.getByRole("button", { name: /^Close / })).toHaveCount(4);
  await expect(actions.getByRole("button", { name: /^Move / })).toHaveCount(4);
  await expect(actions.locator(".file-tab, [data-file-tab-id]")).toHaveCount(0);
  expect(
    await tabs.locator(".file-tab").evaluateAll((cells) =>
      cells.map((cell) => ({
        id: cell.getAttribute("data-file-tab-id"),
        tabs: cell.querySelectorAll('[role="tab"]').length,
      })),
    ),
  ).toEqual([
    { id: "snapshot-001:README.md", tabs: 1 },
    { id: "snapshot-001:src/index.ts", tabs: 1 },
    { id: "snapshot-001:src/components/reader.ts", tabs: 1 },
    { id: "snapshot-001:tests/reader.test.ts", tabs: 1 },
  ]);
  const selected = tablist.getByRole("tab", { selected: true });
  await expect(selected).toHaveAttribute("aria-controls", "file-tab-panel");
  await expect(tabs.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    (await selected.getAttribute("id"))!,
  );
});

test("native Tab reaches the selected file's close button and keyboard close retains focus", async ({
  page,
}) => {
  const tabs = page.locator("cw-file-tabs");
  const selected = tabs.getByRole("tab", { selected: true });
  const actions = tabs.getByRole("group", { name: "File actions", exact: true });
  await selected.focus();
  await page.keyboard.press("End");
  await expect(selected).toHaveAccessibleName("tests/reader.test.ts");
  for (let remaining = 3; remaining >= 0; remaining--) {
    await expect(selected).toBeFocused();
    const description = await selected.getAttribute("aria-label");
    await page.keyboard.press("Tab");
    await expect(
      actions.getByRole("button", { name: `Close ${description}`, exact: true }),
    ).toBeFocused();
    await page.keyboard.press(remaining % 2 === 0 ? "Space" : "Enter");
    await expect(tabs.getByRole("tab")).toHaveCount(remaining);
    if (remaining > 0) await expect(selected).toBeFocused();
    else await expect(tabs).toBeFocused();
  }
});

for (const key of ["Delete", "Enter"] as const) {
  test(`tab close (${key}) never steals focus already moved by a host handler`, async ({
    page,
  }) => {
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.tabs.addEventListener("cw:file-tabs-change", (event: any) => {
        if (event.detail.action === "close")
          document.querySelector<HTMLButtonElement>("#find")!.focus();
      });
    });
    await page.locator("cw-file-tabs").getByRole("tab").first().focus();
    if (key === "Enter") {
      await page.keyboard.press("Tab");
      await expect(
        page.locator("cw-file-tabs").getByRole("button", { name: "Close README.md", exact: true }),
      ).toBeFocused();
    }
    await page.keyboard.press(key);
    await expect(page.locator("cw-file-tabs").getByRole("tab")).toHaveCount(3);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect(page.getByRole("button", { name: "Find file", exact: true })).toBeFocused();
  });
}

test("same-path directory in another immutable scope never inherits native disclosure state", async ({
  page,
}) => {
  const tree = page.locator("cw-repository-tree");
  await tree.locator("summary").first().click();
  await expect(tree.getByRole("button", { name: "index.ts", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.tree.scope = { ...f.scope, ref: "snapshot-002" };
  });
  await expect(tree.locator("summary")).toHaveCount(1);
  expect(
    await tree
      .locator("details")
      .first()
      .evaluate((element) => (element as HTMLDetailsElement).open),
  ).toBe(false);
  await expect(tree.getByRole("button", { name: "index.ts", exact: true })).toHaveCount(0);
  await tree.locator("summary").first().click();
  await expect(tree.getByRole("button", { name: "index.ts", exact: true })).toBeVisible();
  await tree.getByRole("button", { name: "index.ts", exact: true }).click();
  await expect(page.locator("#intent")).toContainText('"ref":"snapshot-002"');
});

test("total loaded tree rows are bounded across directories, not just per response", async ({
  page,
}) => {
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.calls = [];
    f.tree.client = {
      children: async (scope: any, path: string) => {
        f.calls.push(path);
        return {
          ref: scope.ref,
          truncated: false,
          incomplete: false,
          entries: Array.from({ length: 100 }, (_, i) => ({
            path: path ? `${path}/file-${i}` : `dir-${i}`,
            name: `${path ? "file" : "dir"}-${i}`,
            kind: path ? "file" : "directory",
          })),
        };
      },
    };
  });
  const tree = page.locator("cw-repository-tree");
  await expect(tree.locator("summary")).toHaveCount(100);
  for (let i = 0; i < 4; i++) {
    await tree.locator("summary").nth(i).click();
    await expect(tree.locator('[part="file"]')).toHaveCount((i + 1) * 100);
  }
  await tree.locator("summary").nth(4).click();
  await expect(tree).toContainText("Browser row limit reached. Use file search.");
  expect(await page.evaluate(() => (window as any).fixture.calls.length)).toBe(5);
});

test("tree depth is bounded and disconnect ignores late children before reconnecting", async ({
  page,
}) => {
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.calls = [];
    f.tree.client = {
      children: async (scope: any, path: string) => {
        f.calls.push(path);
        return {
          ref: scope.ref,
          entries: [{ path: path ? `${path}/d` : "d", name: "d", kind: "directory" }],
          truncated: false,
          incomplete: false,
        };
      },
    };
  });
  const tree = page.locator("cw-repository-tree");
  for (let i = 0; i < 12; i++) {
    await expect(tree.locator("summary")).toHaveCount(i + 1);
    await tree.locator("summary").nth(i).click();
  }
  await expect(tree).toContainText("Depth limit reached");
  expect(await page.evaluate(() => (window as any).fixture.calls.length)).toBe(12);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.pending = [];
    f.tree.client = {
      children: (scope: any) => new Promise((resolve) => f.pending.push({ scope, resolve })),
    };
  });
  await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.tree.remove();
    document.querySelector("#tree-card")!.append(f.tree);
  });
  await page.waitForFunction(() => (window as any).fixture.pending.length === 2);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.pending[0].resolve({
      ref: f.scope.ref,
      entries: [{ path: "late", name: "late", kind: "file" }],
      truncated: false,
      incomplete: false,
    });
    f.pending[1].resolve({ ref: f.scope.ref, entries: [], truncated: false, incomplete: false });
  });
  await expect(tree).toContainText("Empty directory");
  await expect(tree.locator('[part="file"]')).toHaveCount(0);
});

test("preview cache eviction cannot be undone by an ignored abort and saved scroll is immutable", async ({
  page,
}) => {
  expect(
    await page.evaluate(async () => {
      const f = (window as any).fixture;
      let finish: any,
        aborted = false,
        requestedBudget: number | undefined;
      const controller = new f.ui.SourcePreviewController({
        preview: (file: any, options: any) => {
          requestedBudget = options.maxBytes;
          const result = {
            ref: file.ref,
            path: file.path,
            content: "text",
            binary: false,
            truncated: false,
          };
          if (file.path !== "pending") return Promise.resolve(result);
          options.signal.addEventListener("abort", () => {
            aborted = true;
          });
          return new Promise((resolve) => {
            finish = () => resolve(result);
          });
        },
      });
      const pending = controller.open("oldest", { ...f.scope, path: "pending" });
      for (let i = 0; i < 20; i++)
        await controller.open(String(i), { ...f.scope, path: String(i) });
      const beforeScroll = controller.state;
      controller.rememberScroll(50);
      const afterScroll = controller.state;
      finish();
      await pending;
      controller.selectSurface("oldest");
      return {
        aborted,
        evicted: controller.state === null,
        requestedBudget,
        oldScroll: beforeScroll.scrollTop,
        newScroll: afterScroll.scrollTop,
        snapshot: Object.isFrozen(afterScroll) && beforeScroll !== afterScroll,
      };
    }),
  ).toEqual({
    aborted: true,
    evicted: true,
    requestedBudget: 262144,
    oldScroll: 0,
    newScroll: 50,
    snapshot: true,
  });
});

test("preview binary/empty states and clipboard outcomes are explicit in the actual view", async ({
  page,
}) => {
  const preview = page.locator("cw-source-preview");
  await page.evaluate(async () => {
    const f = (window as any).fixture;
    f.controller.setClient({
      preview: async (file: any) => ({
        ...file,
        content: "",
        binary: file.path === "binary",
        truncated: false,
        size: 0,
      }),
    });
    await f.controller.open("a", { ...f.scope, path: "binary" });
  });
  await expect(preview).toContainText("Binary file. No text preview available.");
  await expect(preview.getByRole("document")).toHaveCount(0);
  await expect(preview.getByRole("button", { name: "Copy file contents" })).toBeDisabled();
  await page.evaluate(async () => {
    const f = (window as any).fixture;
    await f.controller.open("a", { ...f.scope, path: "empty" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Fixture denied");
        },
      },
    });
  });
  await expect(preview).toContainText("Empty text preview.");
  await expect(preview.getByRole("document")).toHaveText("");
  await preview.getByRole("button", { name: "Copy file contents" }).click();
  await expect(preview.locator('[part="copy-status"]')).toHaveText("Copy unavailable");
  await page.evaluate(async () => {
    const f = (window as any).fixture;
    f.controller.setClient(f.previewClient);
    await f.controller.open("reader", { ...f.scope, path: "src/index.ts" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          f.copied = text;
        },
      },
    });
  });
  await preview.getByRole("button", { name: "Copy displayed preview" }).click();
  await expect(preview.locator('[part="copy-status"]')).toHaveText("Copied displayed preview");
  expect(
    await page.evaluate(() => {
      const f = (window as any).fixture;
      return f.copied === f.source;
    }),
  ).toBe(true);
});

test("replacing a search client fences its pending success and error", async ({ page }) => {
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.pending = [];
    f.picker.client = {
      search: () => new Promise((resolve, reject) => f.pending.push({ resolve, reject })),
    };
    f.picker.open = true;
  });
  await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
  await page.locator("cw-file-picker").getByRole("combobox").fill("next");
  await page.waitForFunction(() => (window as any).fixture.pending.length === 2);
  await page.evaluate(() => {
    const f = (window as any).fixture;
    f.picker.client = {
      search: async (scope: any) => ({
        ref: scope.ref,
        paths: ["replacement.txt"],
        truncated: false,
        incomplete: false,
      }),
    };
    f.pending[0].resolve({
      ref: f.scope.ref,
      paths: ["old.txt"],
      truncated: false,
      incomplete: false,
    });
    f.pending[1].reject(new Error("Obsolete transport failure"));
  });
  await expect(page.locator("cw-file-picker").getByRole("option")).toContainText("replacement.txt");
  await expect(page.locator("cw-file-picker").getByRole("alert")).toHaveCount(0);
});
