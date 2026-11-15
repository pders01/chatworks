import { expect, test, type Page } from "playwright/test";
import type { ResolvedAnnotation, SourceAnnotation } from "@jpahd/source-annotations/contracts";

const REF_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const REF_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PATH = "src/example.ts";
const CONTENT = [
  "const first = 1;",
  "return first;",
  "console.log(first);",
  "export default first;",
].join("\n");

interface VirtualRequest {
  method: string;
  params: Record<string, unknown>;
  resolve(value: unknown): void;
  reject(reason?: unknown): void;
}

interface VirtualSourceHarness {
  pending: VirtualRequest[];
  requests: Array<{ method: string; params: Record<string, unknown> }>;
  makeClient(): unknown;
  primaryClient?: unknown;
}

declare global {
  interface Window {
    virtualSourceHarness: VirtualSourceHarness;
  }
}

function baseAnnotation(overrides: Partial<SourceAnnotation> = {}): SourceAnnotation {
  return {
    id: "note-1",
    repositoryId: "repo-1",
    revision: 2,
    createdAt: "2025-01-02T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    author: { kind: "human", name: "Ada" },
    body: "Explain this range.",
    category: "explanation",
    state: "open",
    target: {
      kind: "git",
      commit: REF_A,
      blob: "blob-1",
      path: PATH,
      startLine: 1,
      endLine: 1,
      quote: { exact: "const first = 1;", prefix: "", suffix: "" },
      fingerprint: "fingerprint-1",
      whitespace: "exact",
    },
    ...overrides,
  };
}

function resolved(
  id: string,
  placement: ResolvedAnnotation["placement"],
  overrides: Partial<SourceAnnotation> = {},
): ResolvedAnnotation {
  return { annotation: baseAnnotation({ id, ...overrides }), placement };
}

async function mountSource(
  page: Page,
  options: {
    ref?: string;
    content?: string;
    highlightedLines?: string[];
    readOnly?: boolean;
    showAnnotations?: boolean;
  } = {},
): Promise<void> {
  const content = options.content ?? CONTENT;
  const lineCount = content.split("\n").length;
  await page.goto("/fixture.html");
  await page.evaluate(
    async ({ content, lineCount, ref, highlightedLines, readOnly, showAnnotations }) => {
      const entry = "/compiled-entry.js";
      await import(entry);
      const pending: VirtualRequest[] = [];
      const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
      const makeClient = () =>
        Object.fromEntries(
          ["list", "create", "update", "delete"].map((method) => [
            method,
            (params: Record<string, unknown>) => {
              requests.push({ method, params });
              return new Promise((resolve, reject) =>
                pending.push({ method, params, resolve, reject }),
              );
            },
          ]),
        );
      const primaryClient = makeClient();
      const panel = document.createElement("source-annotation-panel") as unknown as HTMLElement &
        Record<string, unknown>;
      panel.client = primaryClient;
      panel.scopeKey = "session-a";
      panel.path = "src/example.ts";
      panel.requestedRef = "main";
      panel.ref = ref;
      panel.active = true;
      panel.readOnly = Boolean(readOnly);
      panel.allowCreate = true;
      panel.maxLine = lineCount;
      panel.content = content;
      panel.sourceView = true;
      panel.highlightedLines = highlightedLines;
      panel.showAnnotations = showAnnotations;
      document.body.replaceChildren(panel);
      window.virtualSourceHarness = { pending, requests, makeClient, primaryClient };
    },
    {
      content,
      lineCount,
      ref: options.ref ?? REF_A,
      highlightedLines: options.highlightedLines ?? [],
      readOnly: options.readOnly ?? false,
      showAnnotations: options.showAnnotations ?? true,
    },
  );
  if (options.showAnnotations !== false) await waitForRequest(page, "list");
}

async function waitForRequest(page: Page, method: string, count = 1): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        (method) =>
          window.virtualSourceHarness.pending.filter((request) => request.method === method).length,
        method,
      ),
    )
    .toBeGreaterThanOrEqual(count);
}

async function resolveList(
  page: Page,
  items: ResolvedAnnotation[],
  ref: string = REF_A,
): Promise<void> {
  await waitForRequest(page, "list");
  await page.evaluate(
    ({ items, ref }) => {
      const index = window.virtualSourceHarness.pending.findIndex(
        (request) => request.method === "list" && request.params.ref === ref,
      );
      const request = window.virtualSourceHarness.pending.splice(index, 1)[0];
      if (!request) throw new Error(`No pending list request for ${ref}`);
      request.resolve({ repositoryId: "repo-1", ref, items });
    },
    { items, ref },
  );
}

async function resolveMethod(page: Page, method: string, value: unknown): Promise<void> {
  await waitForRequest(page, method);
  await page.evaluate(
    ({ method, value }) => {
      const index = window.virtualSourceHarness.pending.findIndex(
        (request) => request.method === method,
      );
      const request = window.virtualSourceHarness.pending.splice(index, 1)[0];
      if (!request) throw new Error(`No pending ${method} request`);
      request.resolve(value);
    },
    { method, value },
  );
}

async function setPanel(page: Page, properties: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (properties) => {
    const panel = document.querySelector("source-annotation-panel") as unknown as HTMLElement &
      Record<string, unknown>;
    Object.assign(panel, properties);
    await (panel as unknown as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
  }, properties);
}

async function straySourceText(page: Page): Promise<string[]> {
  return await page.locator("source-annotation-panel").evaluate((element) =>
    Array.from(element.shadowRoot!.querySelector(".source-document")!.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean),
  );
}

function sourceNote(
  id: string,
  startLine: number,
  endLine: number,
  status: "unchanged" | "moved" = "unchanged",
  overrides: Partial<SourceAnnotation> = {},
): ResolvedAnnotation {
  return resolved(
    id,
    {
      status,
      ref: REF_A,
      path: PATH,
      startLine,
      endLine,
    },
    overrides,
  );
}

test("renders numbered source, virtual rows, and isolated unplaced notes", async ({ page }) => {
  await mountSource(page, {
    highlightedLines: [
      '<span class="token keyword">const</span> first = <span class="token number">1</span>;',
      '<span class="token keyword">return</span> first;',
    ],
  });
  const panel = page.locator("source-annotation-panel");
  await resolveList(page, [
    sourceNote("unchanged", 1, 1),
    sourceNote("moved", 2, 3, "moved"),
    resolved("stale", { status: "stale", ref: REF_A, path: PATH, reason: "The quote changed." }),
    resolved("other-path", {
      status: "unchanged",
      ref: REF_A,
      path: "other.ts",
      startLine: 1,
      endLine: 1,
    }),
    resolved("out-of-range", {
      status: "moved",
      ref: REF_A,
      path: PATH,
      startLine: 4,
      endLine: 99,
    }),
    resolved("wrong-ref", {
      status: "unchanged",
      ref: REF_B,
      path: PATH,
      startLine: 1,
      endLine: 1,
    }),
  ]);

  await expect(panel.locator('.source-row[data-line="1"] .gutter')).toHaveText("1");
  await expect(panel.locator('.source-row[data-line="1"] .source-code')).toHaveText(
    "const first = 1;",
  );
  await expect(panel.locator('.source-row[data-line="1"] .token.keyword')).toHaveText("const");
  await expect(panel.locator('.source-row[data-line="4"] .source-code')).toHaveText(
    "export default first;",
  );
  await expect(panel.locator(".source-row")).toHaveCount(4);
  await expect(panel.getByRole("spinbutton")).toHaveCount(0);
  await expect(panel.locator(".source-create")).toHaveCount(0);

  const order = await panel.evaluate((element) =>
    Array.from(element.shadowRoot!.querySelector(".source-document")!.children).map(
      (child) => child.getAttribute("data-line") ?? child.getAttribute("data-annotation-id"),
    ),
  );
  expect(order.indexOf("1")).toBeLessThan(order.indexOf("unchanged"));
  expect(order.indexOf("unchanged")).toBeLessThan(order.indexOf("2"));
  expect(order.indexOf("3")).toBeLessThan(order.indexOf("moved"));

  await panel.getByText(/Notes not placed in this source/).click();
  await expect(panel.locator('[data-annotation-id="stale"]')).toBeVisible();
  await expect(panel.locator('[data-annotation-id="other-path"]')).toBeVisible();
  await expect(panel.locator('[data-annotation-id="out-of-range"]')).toBeVisible();
  await expect(panel.locator('.stale-notes [data-annotation-id="wrong-ref"]')).toBeVisible();
  await expect(panel.locator('[data-annotation-id="stale"]')).toContainText("Stale anchor");
});

test("supports gutter and text selections without copying gutter or prose", async ({ page }) => {
  await mountSource(page);
  const panel = page.locator("source-annotation-panel");
  await resolveList(page, [sourceNote("copy-safe", 1, 1)]);

  await panel.getByRole("button", { name: "Select line 2", exact: true }).click();
  await panel
    .getByRole("button", { name: "Select line 4", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(panel.getByText("Lines 2–4 selected")).toBeVisible();
  await expect(panel.locator(".source-row.selected")).toHaveCount(3);

  await panel.getByRole("button", { name: "Select line 2", exact: true }).click();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(panel.getByText("Lines 2–3 selected")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel.getByText(/selected$/)).toHaveCount(0);

  const copied = await panel.evaluate((element) => {
    const root = element.shadowRoot!;
    const code = (line: number) =>
      root.querySelector<HTMLElement>(`.source-row[data-line="${line}"] .source-code`)!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(code(1), 0);
    // A selection ending at column zero belongs to the preceding real line.
    range.setEnd(code(3), 0);
    selection.removeAllRanges();
    selection.addRange(range);
    root
      .querySelector<HTMLElement>(".source-scroll")!
      .dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    const clipboard = {
      value: "",
      setData(_type: string, value: string) {
        this.value = value;
      },
    };
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboard });
    root.querySelector<HTMLElement>(".source-scroll")!.dispatchEvent(event);
    return { value: clipboard.value, prevented: event.defaultPrevented };
  });
  expect(copied).toEqual({ value: "const first = 1;\nreturn first;\n", prevented: true });
  await expect(panel.getByText("Lines 1–2 selected")).toBeVisible();
  await expect(panel.locator(".source-row")).toHaveCount(4);
});

test("opens an inline composer, preserves drafts on cancel, and saves immutable placement", async ({
  page,
}) => {
  await mountSource(page);
  const panel = page.locator("source-annotation-panel");
  await resolveList(page, []);
  await panel.getByRole("button", { name: "Select line 2", exact: true }).click();
  await panel
    .getByRole("button", { name: "Select line 3", exact: true })
    .click({ modifiers: ["Shift"] });
  await panel.getByRole("button", { name: "Add explanation" }).click();
  await expect(panel.getByLabel("New annotation body")).toBeFocused();
  await panel.getByLabel("New annotation body").fill("A draft explanation");
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.getByLabel("New annotation body")).toHaveCount(0);
  expect(
    await panel.evaluate((element) =>
      (element.shadowRoot!.activeElement as HTMLElement)?.getAttribute("aria-label"),
    ),
  ).toBe("Select line 3");

  await panel.getByRole("button", { name: "Add explanation" }).click();
  await expect(panel.getByLabel("New annotation body")).toHaveValue("A draft explanation");
  await panel.getByRole("button", { name: "Save explanation" }).click();
  const create = await page.evaluate(() => window.virtualSourceHarness.requests.at(-1));
  expect(create).toMatchObject({
    method: "create",
    params: {
      ref: REF_A,
      path: PATH,
      startLine: 2,
      endLine: 3,
      body: "A draft explanation",
      category: "explanation",
      whitespace: "exact",
    },
  });
  await resolveMethod(
    page,
    "create",
    baseAnnotation({
      id: "created",
      body: "A draft explanation",
      target: {
        ...baseAnnotation().target,
        startLine: 2,
        endLine: 3,
        quote: { exact: "return first;\nconsole.log(first);", prefix: "", suffix: "" },
      },
    }),
  );
  await expect(panel.locator('[data-annotation-id="created"]')).toBeVisible();
  await expect(panel.getByLabel("New annotation body")).toHaveCount(0);
});

test("keeps source and drafts while annotations are hidden", async ({ page }) => {
  await mountSource(page);
  const panel = page.locator("source-annotation-panel");
  await resolveList(page, [sourceNote("visible", 1, 1)]);
  await panel.getByRole("button", { name: "Select line 1", exact: true }).click();
  await panel.getByRole("button", { name: "Add explanation" }).click();
  await panel.getByLabel("New annotation body").fill("Draft survives visibility changes");

  await setPanel(page, { showAnnotations: false });
  await expect(panel.locator(".source-row")).toHaveCount(4);
  await expect(panel.locator('[data-annotation-id="visible"]')).toHaveCount(0);
  await expect(panel.getByLabel("New annotation body")).toHaveCount(0);
  expect(await straySourceText(page)).toEqual([]);
  await expect(panel.locator('.source-row[data-line="1"] .source-code')).toHaveText(
    "const first = 1;",
  );

  await setPanel(page, { showAnnotations: true });
  await expect(panel.locator('[data-annotation-id="visible"]')).toBeVisible();
  await expect(panel.getByLabel("New annotation body")).toHaveValue(
    "Draft survives visibility changes",
  );
});

test("fences late ref and client-authority results and restores only the matching draft", async ({
  page,
}) => {
  await mountSource(page);
  const panel = page.locator("source-annotation-panel");

  // Switch refs before the first list resolves: the old item must not enter B.
  await setPanel(page, { ref: REF_B });
  await waitForRequest(page, "list", 2);
  await resolveList(page, [sourceNote("late-old", 1, 1)], REF_A);
  await expect(panel.locator('[data-annotation-id="late-old"]')).toHaveCount(0);
  await resolveList(
    page,
    [
      {
        ...sourceNote("current", 2, 2),
        placement: { ...sourceNote("current", 2, 2).placement, ref: REF_B },
      },
    ],
    REF_B,
  );
  await expect(panel.locator('[data-annotation-id="current"]')).toBeVisible();

  // Drafts are keyed by ref. Create one in A, leave it pending while B loads,
  // then return to A and prove that only its draft comes back.
  await setPanel(page, { ref: REF_A });
  await resolveList(page, [], REF_A);
  await panel.getByRole("button", { name: "Select line 1", exact: true }).click();
  await panel.getByRole("button", { name: "Add explanation" }).click();
  await panel.getByLabel("New annotation body").fill("Draft for ref A");
  await setPanel(page, { ref: REF_B });
  await resolveList(page, [], REF_B);
  await setPanel(page, { ref: REF_A });
  await resolveList(page, [], REF_A);
  await panel.getByRole("button", { name: "Select line 1", exact: true }).click();
  await panel.getByRole("button", { name: "Add explanation" }).click();
  await expect(panel.getByLabel("New annotation body")).toHaveValue("Draft for ref A");

  // A different client object is a different host scope, not a way to inherit A.
  await page.evaluate(() => {
    const panel = document.querySelector("source-annotation-panel") as unknown as HTMLElement &
      Record<string, unknown>;
    panel.client = window.virtualSourceHarness.makeClient();
  });
  await resolveList(page, [], REF_A);
  await panel.getByRole("button", { name: "Select line 2", exact: true }).click();
  await panel.getByRole("button", { name: "Add explanation" }).click();
  await expect(panel.getByLabel("New annotation body")).toHaveValue("");

  await page.evaluate(() => {
    const panel = document.querySelector("source-annotation-panel") as unknown as HTMLElement &
      Record<string, unknown>;
    panel.client = window.virtualSourceHarness.primaryClient;
  });
  await resolveList(page, [], REF_A);
  await panel.getByRole("button", { name: "Select line 1", exact: true }).click();
  await panel.getByRole("button", { name: "Add explanation" }).click();
  await expect(panel.getByLabel("New annotation body")).toHaveValue("Draft for ref A");
});

test("updates and deletes virtual notes without changing source rows", async ({ page }) => {
  await mountSource(page);
  const panel = page.locator("source-annotation-panel");
  await resolveList(page, [sourceNote("mutable", 2, 2)]);
  const note = panel.locator('[data-annotation-id="mutable"]');
  await note.getByText("Details", { exact: true }).click();
  await note.getByRole("button", { name: "Edit" }).click();
  await note.getByLabel("Edit annotation").fill("Updated virtual note");
  await note.getByRole("button", { name: "Save edit" }).click();
  const update = await page.evaluate(() => window.virtualSourceHarness.requests.at(-1));
  expect(update).toMatchObject({
    method: "update",
    params: { id: "mutable", expectedRevision: 2, body: "Updated virtual note" },
  });
  await resolveMethod(
    page,
    "update",
    baseAnnotation({ id: "mutable", body: "Updated virtual note" }),
  );
  await expect(note).toContainText("Updated virtual note");
  await expect(panel.locator('.source-row[data-line="2"] .source-code')).toHaveText(
    "return first;",
  );

  await note.getByText("Details", { exact: true }).click();
  await note.getByRole("button", { name: "Delete" }).click();
  const deletion = await page.evaluate(() => window.virtualSourceHarness.requests.at(-1));
  expect(deletion).toMatchObject({
    method: "delete",
    params: { id: "mutable", expectedRevision: 2 },
  });
  await resolveMethod(page, "delete", { deleted: true });
  await expect(panel.locator('[data-annotation-id="mutable"]')).toHaveCount(0);
  await expect(panel.locator(".source-row")).toHaveCount(4);
});

test("does not expose mutation controls in read-only source mode", async ({ page }) => {
  await mountSource(page, { readOnly: true });
  const panel = page.locator("source-annotation-panel");
  await resolveList(page, [sourceNote("read-only", 1, 1)]);
  await panel.getByText("Details", { exact: true }).click();
  await expect(panel.getByRole("button", { name: "Edit" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Resolve" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Delete" })).toBeDisabled();
  await panel.getByRole("button", { name: "Select line 1", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Add explanation" })).toHaveCount(0);
  expect(
    await page.evaluate(() => window.virtualSourceHarness.requests.map(({ method }) => method)),
  ).toEqual(["list"]);
});

test("pages large source without creating an unbounded source DOM", async ({ page }) => {
  const content = Array.from({ length: 1200 }, (_, index) => `line ${index + 1};`).join("\n");
  await mountSource(page, { content });
  const panel = page.locator("source-annotation-panel");
  await resolveList(page, []);
  await expect(panel.locator(".source-row")).toHaveCount(500);
  await expect(panel.getByRole("button", { name: "Next" }).first()).toBeEnabled();
  await panel.getByRole("button", { name: "Next" }).first().click();
  await expect(panel.getByRole("button", { name: "Select line 501", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Select line 1", exact: true })).toHaveCount(0);
  await expect(panel.locator(".source-row")).toHaveCount(500);
});

test("can browse numbered source without loading hidden annotations", async ({ page }) => {
  await mountSource(page, { showAnnotations: false });
  const panel = page.locator("source-annotation-panel");
  await expect(panel.locator(".source-row")).toHaveCount(4);
  expect(await page.evaluate(() => window.virtualSourceHarness.requests)).toEqual([]);
  expect(await straySourceText(page)).toEqual([]);
  await setPanel(page, { showAnnotations: true });
  await resolveList(page, [sourceNote("shown", 1, 1)]);
  await expect(panel.locator('[data-annotation-id="shown"]')).toBeVisible();
});

test("shows empty source without inventing a selectable line", async ({ page }) => {
  await mountSource(page, { content: "" });
  await resolveList(page, []);
  const panel = page.locator("source-annotation-panel");
  await expect(panel.getByText("Empty file.", { exact: true })).toBeVisible();
  await expect(panel.locator(".source-row")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Add explanation", exact: true })).toHaveCount(0);
});

test("infers an annotation range from an actual text drag", async ({ page }) => {
  await mountSource(page);
  await resolveList(page, [sourceNote("between-lines", 1, 1)]);
  const panel = page.locator("source-annotation-panel");
  const first = (await panel.locator('.source-row[data-line="1"] .source-code').boundingBox())!;
  const last = (await panel.locator('.source-row[data-line="3"] .source-code').boundingBox())!;
  await page.mouse.move(first.x + 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + 60, last.y + last.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(panel.getByText("Lines 1–3 selected")).toBeVisible();
  await panel.getByRole("button", { name: "Add explanation", exact: true }).click();
  await expect(panel.getByLabel("New annotation body")).toBeFocused();
});

test("copies partial source selections faithfully", async ({ page }) => {
  await mountSource(page);
  await resolveList(page, []);
  const copied = await page.locator("source-annotation-panel").evaluate((element) => {
    const code = element.shadowRoot!.querySelector('.source-row[data-line="2"] .source-code')!;
    const text = document.createTreeWalker(code, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange();
    range.setStart(text, 7);
    range.setEnd(text, 12);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const clipboard = new DataTransfer();
    code.dispatchEvent(
      new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: clipboard }),
    );
    return clipboard.getData("text/plain");
  });
  expect(copied).toBe("first");
});

test("keeps a changed composer range explicit and supports Escape", async ({ page }) => {
  await mountSource(page);
  await resolveList(page, []);
  const panel = page.locator("source-annotation-panel");
  await panel.getByRole("button", { name: "Select line 1", exact: true }).click();
  await panel.getByRole("button", { name: "Add explanation", exact: true }).click();
  await panel.getByLabel("New annotation body").fill("Keep this draft");
  await panel
    .getByRole("button", { name: "Select line 3", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(panel.getByText("Add explanation for lines 1–3", { exact: true })).toBeVisible();
  await panel.getByLabel("New annotation body").focus();
  await page.keyboard.press("Escape");
  await expect(panel.getByLabel("New annotation body")).toHaveCount(0);
  await panel.getByRole("button", { name: "Add explanation", exact: true }).click();
  await expect(panel.getByLabel("New annotation body")).toHaveValue("Keep this draft");
  await panel.getByRole("button", { name: "Save explanation", exact: true }).click();
  expect(
    await page.evaluate(() => window.virtualSourceHarness.requests.at(-1)?.params),
  ).toMatchObject({ startLine: 1, endLine: 3 });
});

test("does not let an old mutation unlock a newer operation after scope return", async ({
  page,
}) => {
  await mountSource(page);
  await resolveList(page, []);
  const panel = page.locator("source-annotation-panel");
  await panel.getByRole("button", { name: "Select line 1", exact: true }).click();
  await panel.getByRole("button", { name: "Add explanation", exact: true }).click();
  await panel.getByLabel("New annotation body").fill("First operation");
  await panel.getByRole("button", { name: "Save explanation", exact: true }).click();
  await setPanel(page, { ref: REF_B });
  await resolveList(page, [], REF_B);
  await setPanel(page, { ref: REF_A });
  await resolveList(page, [], REF_A);
  await panel.getByRole("button", { name: "Add explanation", exact: true }).click();
  await panel.getByLabel("New annotation body").fill("Second operation");
  await panel.getByRole("button", { name: "Save explanation", exact: true }).click();
  await resolveMethod(page, "create", baseAnnotation({ id: "first", body: "First operation" }));
  await expect(panel.getByRole("button", { name: "Save explanation", exact: true })).toBeDisabled();
  await expect(panel.getByLabel("New annotation body")).toHaveValue("Second operation");
  await expect(panel.locator('[data-annotation-id="first"]')).toHaveCount(0);
  await resolveMethod(page, "create", baseAnnotation({ id: "second", body: "Second operation" }));
  await expect(panel.locator('[data-annotation-id="second"]')).toBeVisible();
});

test("keeps cross-page keyboard selections and their composer reachable", async ({ page }) => {
  await mountSource(page, {
    content: Array.from({ length: 510 }, (_, i) => `line ${i + 1}`).join("\n"),
  });
  await resolveList(page, []);
  const panel = page.locator("source-annotation-panel");
  await panel.getByRole("button", { name: "Select line 500", exact: true }).click();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(panel.getByRole("button", { name: "Select line 501", exact: true })).toBeFocused();
  await panel.getByRole("button", { name: "Add explanation", exact: true }).click();
  await expect(panel.getByLabel("New annotation body")).toBeFocused();
  await expect(panel.getByText("Add explanation for lines 500–501", { exact: true })).toBeVisible();
});
