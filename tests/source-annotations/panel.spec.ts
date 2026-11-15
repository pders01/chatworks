import { expect, test, type Page } from "playwright/test";

async function mount(page: Page, query = "") {
  await page.goto(`/${query}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "");
  return page.locator("source-annotation-panel");
}

async function compose(page: Page, line = 5) {
  const panel = page.locator("source-annotation-panel");
  await panel.getByRole("button", { name: `Select line ${line}`, exact: true }).click();
  await panel.getByRole("button", { name: "Add explanation", exact: true }).click();
  return panel.getByLabel("New annotation body");
}

test("public compiled entry renders virtual notes, never stale notes in code, and emits semantic changes", async ({
  page,
}) => {
  const panel = await mount(page);
  await expect(panel.locator(".source-row")).toHaveCount(16);
  await expect(panel.locator(".virtual-annotation")).toHaveCount(2);
  await expect(
    panel.locator(".virtual-annotation").filter({ hasText: "Should this cache also be shared" }),
  ).toHaveCount(0);
  await expect(panel.locator(".stale-notes > summary")).toHaveText(
    "Notes not placed in this source (1)",
  );
  await page.evaluate(() => {
    (window as any).changes = [];
    (window as any).piChanges = 0;
    document.addEventListener("source-annotations-changed", (event) =>
      (window as any).changes.push((event as CustomEvent).detail),
    );
    document.addEventListener("pi:annotations-changed", () => {
      (window as any).piChanges += 1;
    });
  });
  await (await compose(page)).fill("A synthetic review of the map's lifetime.");
  await panel.getByRole("button", { name: "Save explanation", exact: true }).click();
  await expect(panel.locator(".virtual-annotation")).toHaveCount(3);
  const events = await page.evaluate(() => (window as any).changes);
  expect(events).toEqual([
    {
      scopeKey: "synthetic-example/account-a",
      path: "src/cache/remember.ts",
      ref: "a7c841e93d504b2f8ea6921bd6c30598f12e407a",
    },
  ]);
  expect(await page.evaluate(() => (window as any).piChanges)).toBe(0);
  await expect(panel.getByRole("button", { name: "Select line 5", exact: true })).toBeFocused();
});

test("embedded readers can omit a duplicate path heading without hiding snapshot provenance", async ({
  page,
}) => {
  const panel = await mount(page);
  await expect(panel.getByRole("heading", { name: "src/cache/remember.ts" })).toBeVisible();
  await panel.evaluate((element: any) => {
    element.hidePath = true;
  });
  await expect(panel.getByRole("heading", { name: "src/cache/remember.ts" })).toHaveCount(0);
  await expect(panel.locator(".source-context > summary")).toContainText("Snapshot a7c841e9");
  await expect(panel.locator(".virtual-annotation")).toHaveCount(2);
});

test("gutter keyboard range and exact source copy exclude virtual rows and gutters", async ({
  page,
}) => {
  const panel = await mount(page);
  const gutter = panel.getByRole("button", { name: "Select line 8", exact: true });
  await gutter.click();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(panel.locator(".source-row.selected")).toHaveCount(3);
  const copied = await panel
    .getByRole("button", { name: "Select line 10", exact: true })
    .evaluate((button) => {
      const data = new DataTransfer();
      button.dispatchEvent(
        new ClipboardEvent("copy", {
          clipboardData: data,
          bubbles: true,
          composed: true,
          cancelable: true,
        }),
      );
      return data.getData("text/plain");
    });
  expect(copied).toBe(
    "    const now = Date.now();\n    const cached = entries.get(key);\n    if (cached && cached.expiresAt > now) return cached.value;",
  );
  await page.keyboard.press("Escape");
  await expect(panel.locator(".source-row.selected")).toHaveCount(0);
});

test("drafts survive remount but are isolated by explicit scope and client identity", async ({
  page,
}) => {
  const panel = await mount(page);
  await (await compose(page)).fill("Keep this scoped draft.");
  await page.evaluate(async () => {
    const url = "/main.ts";
    const { panel } = await import(url);
    const position = panel.captureSourcePosition();
    const replacement = document.createElement("source-annotation-panel") as any;
    for (const key of [
      "client",
      "scopeKey",
      "path",
      "ref",
      "requestedRef",
      "active",
      "sourceView",
      "allowCreate",
      "content",
      "maxLine",
    ])
      replacement[key] = panel[key];
    panel.replaceWith(replacement);
    await replacement.restoreSourcePosition(position);
  });
  await expect(panel.getByLabel("New annotation body")).toHaveValue("Keep this scoped draft.");
  await panel.evaluate(async (element: any) => {
    element.scopeKey = "other-account";
    await element.updateComplete;
  });
  await expect(panel.locator(".source-row.selected")).toHaveCount(0);
  await expect(panel.locator(".source-create")).toHaveCount(0);
  await expect(await compose(page)).toHaveValue("");
  await panel.evaluate(async (element: any) => {
    element.scopeKey = "synthetic-example/account-a";
    const original = element.client;
    element.client = {
      list: original.list.bind(original),
      create: original.create.bind(original),
      update: original.update.bind(original),
      delete: original.delete.bind(original),
    };
    await element.updateComplete;
  });
  await expect(await compose(page)).toHaveValue("");
});

test("fences a late list and a late mutation when a client or scope changes", async ({ page }) => {
  const panel = await mount(page);
  await page.evaluate(async () => {
    const url = "/main.ts";
    const { panel, client } = await import(url);
    const snapshot = await client.list({ ref: panel.ref });
    (window as any).releaseList = undefined;
    panel.client = {
      ...client,
      list: () =>
        new Promise((resolve) => {
          (window as any).releaseList = () => resolve(snapshot);
        }),
    };
    await panel.updateComplete;
  });
  await expect(panel.locator(".virtual-annotation")).toHaveCount(0);
  await panel.evaluate(async (element: any) => {
    element.scopeKey = "new-owner";
    element.client = {
      list: async () => ({ repositoryId: "empty-owner", ref: element.ref, items: [] }),
    };
    await element.updateComplete;
  });
  await page.evaluate(() => (window as any).releaseList());
  await expect(panel.locator(".virtual-annotation")).toHaveCount(0);
  await page.evaluate(async () => {
    const url = "/main.ts";
    const { client } = await import(url);
    const panel = document.querySelector("source-annotation-panel") as any;
    panel.client = client;
    client.create = (input: any) =>
      new Promise((resolve) => {
        (window as any).releaseCreate = () =>
          resolve({ ...client.items[0].annotation, id: "late", body: input.body });
      });
    await panel.updateComplete;
  });
  await (await compose(page)).fill("Must never enter the next scope.");
  await panel.getByRole("button", { name: "Save explanation", exact: true }).click();
  await panel.evaluate(async (element: any) => {
    element.scopeKey = "next-owner";
    await element.updateComplete;
  });
  await page.evaluate(() => (window as any).releaseCreate());
  await expect(panel.locator(".virtual-annotation")).toHaveCount(2);
  await expect(
    panel.locator(".virtual-annotation").filter({ hasText: "Must never enter the next scope." }),
  ).toHaveCount(0);
});

test("optimistic revision conflicts preserve the edit draft and allow an explicit refresh", async ({
  page,
}) => {
  const panel = await mount(page, "?state=edit");
  await panel.getByLabel("Edit annotation").fill("Unsent reasoning survives a conflict.");
  await page.evaluate(async () => {
    const url = "/main.ts";
    const { client } = await import(url);
    client.items[0].annotation.revision += 1;
  });
  await panel.getByRole("button", { name: "Save edit", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("This note changed elsewhere.");
  await expect(panel.getByLabel("Edit annotation")).toHaveValue(
    "Unsent reasoning survives a conflict.",
  );
  await panel.getByRole("button", { name: "Refresh annotations", exact: true }).click();
  await expect(panel.getByLabel("Edit annotation")).toHaveValue(
    "Unsent reasoning survives a conflict.",
  );
  await panel.getByRole("button", { name: "Save edit", exact: true }).click();
  await expect(panel.locator(".body").first()).toHaveText("Unsent reasoning survives a conflict.");
});

test("paged source preserves source rows, selection, and position via the public API", async ({
  page,
}) => {
  const panel = await mount(page, "?state=long");
  await expect(panel.locator(".source-row")).toHaveCount(500);
  await panel.getByRole("button", { name: "Next", exact: true }).first().click();
  await expect(panel.locator('.source-row[data-line="501"]')).toHaveCount(1);
  await panel.getByRole("button", { name: "Select line 502", exact: true }).click();
  const position = await panel.evaluate((element: any) => element.captureSourcePosition());
  expect(position.page).toBe(1);
  await panel.getByRole("button", { name: "Previous", exact: true }).first().click();
  await panel.evaluate(
    async (element: any, position) => element.restoreSourcePosition(position),
    position,
  );
  await expect(panel.locator('.source-row[data-line="502"].selected')).toHaveCount(1);
  await panel.evaluate(async (element: any, position) => {
    element.scopeKey = "different";
    await element.updateComplete;
    await element.restoreSourcePosition(position);
  }, position);
  await expect(panel.locator('.source-row[data-line="1"]')).toHaveCount(1);
});

test("a refresh completing after an accepted mutation cannot restore an older revision", async ({
  page,
}) => {
  const panel = await mount(page);
  await page.evaluate(async () => {
    const url = "/main.ts";
    const { client } = await import(url);
    const originalList = client.list.bind(client);
    const originalCreate = client.create.bind(client);
    client.list = async (query: any) => {
      const snapshot = await originalList(query);
      return new Promise((resolve) => {
        (window as any).releaseRefresh = () => resolve(snapshot);
      });
    };
    client.create = (input: any) =>
      new Promise((resolve) => {
        (window as any).releaseMutation = async () => resolve(await originalCreate(input));
      });
  });
  await (await compose(page)).fill("Accepted before the stale refresh completes.");
  await panel.getByRole("button", { name: "Save explanation", exact: true }).click();
  await panel.getByRole("button", { name: "Refresh annotations", exact: true }).click();
  await page.evaluate(async () => (window as any).releaseMutation());
  await expect(panel.locator(".virtual-annotation")).toHaveCount(3);
  await page.evaluate(() => (window as any).releaseRefresh());
  await expect(panel.locator(".virtual-annotation")).toHaveCount(3);
  await expect(
    panel.getByText("Accepted before the stale refresh completes.", { exact: true }),
  ).toBeVisible();
});

test("an absent explicit scope never falls back to an ambient client authority", async ({
  page,
}) => {
  const panel = await mount(page);
  await panel.evaluate(async (element: any) => {
    let reads = 0;
    element.client = {
      list: async () => {
        reads += 1;
        throw new Error("Must not be read");
      },
    };
    element.scopeKey = "";
    await element.updateComplete;
    (window as any).unscopedReads = reads;
  });
  await expect(panel.locator(".virtual-annotation")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).unscopedReads)).toBe(0);
});

for (const theme of ["light", "dark"]) {
  for (const state of [
    "populated",
    "empty",
    "edit",
    "compose",
    "error",
    "empty-file",
    "readonly",
  ]) {
    for (const narrow of [false, true]) {
      test(`review ${theme} / ${state} / ${narrow ? "narrow" : "wide"}`, async ({
        page,
      }, testInfo) => {
        if (narrow) await page.setViewportSize({ width: 390, height: 1000 });
        const panel = await mount(
          page,
          `?theme=${theme}&state=${state}${narrow ? "&narrow=1" : ""}`,
        );
        await expect(panel).toBeVisible();
        if (state === "error")
          await expect(panel.getByRole("alert")).toContainText("Your source is still available.");
        if (state === "readonly")
          await expect(panel.getByText("Read only", { exact: true })).toBeVisible();
        if (state === "empty")
          await expect(
            panel.getByText("No notes yet. The source speaks for itself."),
          ).toBeVisible();
        if (state === "empty-file")
          await expect(panel.getByText("Empty file.", { exact: true })).toBeVisible();
        if (state === "edit") await expect(panel.getByLabel("Edit annotation")).toBeVisible();
        if (state === "compose")
          await expect(panel.getByLabel("New annotation body")).toBeVisible();
        const sizes = await panel.evaluate((element) => ({
          outer: element.getBoundingClientRect().width,
          page: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }));
        expect(sizes.page).toBeLessThanOrEqual(sizes.viewport);
        expect(sizes.outer).toBeGreaterThan(250);
        const metrics = await panel
          .locator(".source-row")
          .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
        if (metrics.length) expect(new Set(metrics).size).toBe(1);
        await page.screenshot({
          path: testInfo.outputPath(`${theme}-${state}-${narrow ? "narrow" : "wide"}.png`),
          fullPage: true,
        });
      });
    }
  }
}
