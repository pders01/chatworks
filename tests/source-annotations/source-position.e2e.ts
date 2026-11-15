import { expect, test, type Page } from "playwright/test";
import type { AnnotationSourcePosition, SourceAnnotationPanel } from "./dist/index.js";

const REF_A = "a".repeat(40);
const REF_B = "b".repeat(40);
const PATH = "src/position.ts";
const DRAFT = "Keep this explanation and its selected range while switching file tabs.";
type ScopeField = "client" | "scopeKey" | "path" | "ref" | "requestedRef";

interface SourcePositionHarness {
  panel: SourceAnnotationPanel;
  primaryClient: SourceAnnotationPanel["client"];
  makeClient(): SourceAnnotationPanel["client"];
  makePanel(): SourceAnnotationPanel;
  settle(): Promise<void>;
  saved?: AnnotationSourcePosition;
  lateRestore?: Promise<void>;
  requests: Array<{ method: string; params: Record<string, unknown> }>;
}

declare global {
  interface Window {
    sourcePositionHarness: SourcePositionHarness;
  }
}

async function mount(page: Page): Promise<void> {
  await page.goto("/fixture.html");
  await page.evaluate(
    async ({ ref, path }) => {
      const viewport = document.createElement("meta");
      viewport.name = "viewport";
      viewport.content = "width=device-width, initial-scale=1";
      document.head.append(viewport);
      const panelUrl = "/compiled-entry.js";
      await import(panelUrl);
      const requests: SourcePositionHarness["requests"] = [];
      const makeClient = () =>
        ({
          async list(params: { ref: string }) {
            requests.push({ method: "list", params });
            return { repositoryId: "position-repo", ref: params.ref, items: [] };
          },
        }) as unknown as SourceAnnotationPanel["client"];
      const primaryClient = makeClient();
      const makePanel = () => {
        const panel = document.createElement("source-annotation-panel") as SourceAnnotationPanel;
        Object.assign(panel, {
          client: primaryClient,
          scopeKey: "position-session",
          path,
          ref,
          requestedRef: "main",
          active: true,
          allowCreate: true,
          sourceView: true,
          showAnnotations: true,
          maxLine: 1200,
          content: Array.from(
            { length: 1200 },
            (_, index) => `line ${index + 1}: ${"wide source text ".repeat(40)}`,
          ).join("\n"),
        });
        panel.style.cssText = "display:block; width:min(100%, 760px); height:300px";
        document.body.replaceChildren(panel);
        // Give both public scroll surfaces independent, nonzero ranges. Everything
        // else uses the real panel styles; no private component state is assigned.
        const sizing = new CSSStyleSheet();
        sizing.replaceSync(".source-scroll { flex: 0 0 380px; }");
        panel.shadowRoot!.adoptedStyleSheets = [...panel.shadowRoot!.adoptedStyleSheets, sizing];
        return panel;
      };
      window.sourcePositionHarness = {
        panel: makePanel(),
        primaryClient,
        makeClient,
        makePanel,
        requests,
        async settle() {
          const panel = window.sourcePositionHarness.panel;
          while (!(await panel.updateComplete)) {
            /* Scope setup schedules another Lit update. */
          }
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        },
      };
      await window.sourcePositionHarness.settle();
      await document.fonts.ready;
    },
    { ref: REF_A, path: PATH },
  );
  await expect(page.locator("source-annotation-panel .source-row")).toHaveCount(500);
}

async function rememberPosition(page: Page, composer = true): Promise<AnnotationSourcePosition> {
  const panel = page.locator("source-annotation-panel");
  await panel.getByRole("button", { name: "Next", exact: true }).first().click();
  await expect(panel.locator('.source-row[data-line="501"]')).toHaveCount(1);
  if (composer) {
    await panel.getByRole("button", { name: "Select line 502", exact: true }).click();
    await panel
      .getByRole("button", { name: "Select line 504", exact: true })
      .click({ modifiers: ["Shift"] });
    await panel.getByRole("button", { name: "Add explanation", exact: true }).click();
    await panel.getByLabel("New annotation body").fill(DRAFT);
  }
  const position = await page.evaluate(async () => {
    const harness = window.sourcePositionHarness;
    await harness.settle();
    const root = harness.panel.shadowRoot!;
    root.querySelector<HTMLElement>(".panel")!.scrollTop = 45;
    const source = root.querySelector<HTMLElement>(".source-scroll")!;
    source.scrollTop = 190;
    source.scrollLeft = 210;
    harness.saved = harness.panel.captureSourcePosition();
    return harness.saved;
  });
  expect(position).toMatchObject({
    page: 1,
    panelTop: 45,
    sourceTop: 190,
    sourceLeft: 210,
    composerOpen: composer,
  });
  expect(position.scope).not.toBe("");
  return position;
}

async function expectRestored(page: Page, position: AnnotationSourcePosition): Promise<void> {
  // Inspect scroll before locator actions can scroll the composer into view.
  await expect
    .poll(() => page.evaluate(() => window.sourcePositionHarness.panel.captureSourcePosition()))
    .toEqual(position);
  const panel = page.locator("source-annotation-panel");
  await expect(panel.locator(".source-row")).toHaveCount(500);
  await expect(panel.locator('.source-row[data-line="501"]')).toHaveCount(1);
  await expect(panel.locator('.source-row[data-line="1000"]')).toHaveCount(1);
  await expect(panel.locator('.source-row[data-line="1"]')).toHaveCount(0);
  if (position.composerOpen) {
    await expect(panel.getByLabel("New annotation body")).toHaveValue(DRAFT);
    await expect(panel.getByText("Add explanation for lines 502–504", { exact: true })).toHaveCount(
      1,
    );
    await expect(panel.locator(".source-row.selected")).toHaveCount(3);
    for (const line of [502, 503, 504]) {
      await expect(
        panel.getByRole("button", { name: `Select line ${line}`, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
  } else {
    await expect(panel.getByLabel("New annotation body")).toHaveCount(0);
  }
  expect(
    await page.evaluate(() =>
      window.sourcePositionHarness.requests.every(({ method }) => method === "list"),
    ),
  ).toBe(true);
}

async function changeScope(page: Page, field: ScopeField, original = false): Promise<void> {
  await page.evaluate(
    async ({ field, original, refA, refB, path }) => {
      const harness = window.sourcePositionHarness;
      switch (field) {
        case "client":
          harness.panel.client = original ? harness.primaryClient : harness.makeClient();
          break;
        case "scopeKey":
          harness.panel.scopeKey = original ? "position-session" : "other-session";
          break;
        case "path":
          harness.panel.path = original ? path : "src/other-position.ts";
          break;
        case "ref":
          harness.panel.ref = original ? refA : refB;
          break;
        case "requestedRef":
          harness.panel.requestedRef = original ? "main" : "topic";
          break;
      }
      await harness.settle();
    },
    { field, original, refA: REF_A, refB: REF_B, path: PATH },
  );
}

test("restores a 500-line page, both scroll surfaces and cached selection/draft after remount", async ({
  page,
}) => {
  await mount(page);
  const position = await rememberPosition(page);
  await page.evaluate(async () => {
    const harness = window.sourcePositionHarness;
    harness.panel = harness.makePanel();
    // Deliberately call before its initial update: the public API must wait for
    // initial scope setup, including the existing selection and draft caches.
    await harness.panel.restoreSourcePosition(harness.saved!);
    await harness.settle();
  });
  await expectRestored(page, position);
});

for (const field of ["client", "scopeKey", "path", "ref", "requestedRef"] as const) {
  test(`rejects cross-${field} positions and restores only on matching scope return`, async ({
    page,
  }) => {
    await mount(page);
    const position = await rememberPosition(page);
    await changeScope(page, field);
    const other = await page.evaluate(() =>
      window.sourcePositionHarness.panel.captureSourcePosition(),
    );
    expect(other.scope).not.toBe(position.scope);
    expect(other.page).toBe(0);
    expect(other.composerOpen).toBe(false);
    await page.evaluate(async () => {
      const harness = window.sourcePositionHarness;
      await harness.panel.restoreSourcePosition(harness.saved!);
    });
    expect(
      await page.evaluate(() => window.sourcePositionHarness.panel.captureSourcePosition()),
    ).toEqual(other);
    await expect(page.locator('source-annotation-panel .source-row[data-line="1"]')).toHaveCount(1);
    await expect(page.getByLabel("New annotation body")).toHaveCount(0);
    // The new scope must not inherit either the selected range or draft body.
    await expect(page.locator("source-annotation-panel .source-row.selected")).toHaveCount(0);
    await page.getByRole("button", { name: "Select line 1", exact: true }).click();
    await page.getByRole("button", { name: "Add explanation", exact: true }).click();
    await expect(page.getByLabel("New annotation body")).toHaveValue("");
    await page.getByLabel("New annotation body").fill(`Unrelated ${field} draft`);
    await changeScope(page, field, true);
    await page.evaluate(async () => {
      const harness = window.sourcePositionHarness;
      await harness.panel.restoreSourcePosition(harness.saved!);
    });
    await expectRestored(page, position);
  });
}

test("a captured closed composer stays closed without deleting its cached draft", async ({
  page,
}) => {
  await mount(page);
  await rememberPosition(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const position = await page.evaluate(async () => {
    const harness = window.sourcePositionHarness;
    await harness.settle();
    harness.saved = harness.panel.captureSourcePosition();
    return harness.saved;
  });
  expect(position.composerOpen).toBe(false);
  await page.evaluate(async () => {
    const harness = window.sourcePositionHarness;
    harness.panel = harness.makePanel();
    await harness.panel.restoreSourcePosition(harness.saved!);
    await harness.settle();
  });
  await expectRestored(page, position);
  await page.getByRole("button", { name: "Add explanation", exact: true }).click();
  await expect(page.getByLabel("New annotation body")).toHaveValue(DRAFT);
  await expect(page.getByText("Add explanation for lines 502–504", { exact: true })).toHaveCount(1);
});

test("clamps a restored page to the available source instead of rendering an empty page", async ({
  page,
}) => {
  await mount(page);
  await rememberPosition(page, false);
  await page.evaluate(async () => {
    const harness = window.sourcePositionHarness;
    await harness.panel.restoreSourcePosition({ ...harness.saved!, page: 999 });
  });
  await expect(page.locator("source-annotation-panel .source-row")).toHaveCount(200);
  await expect(page.locator('source-annotation-panel .source-row[data-line="1001"]')).toHaveCount(
    1,
  );
  expect(
    await page.evaluate(() => window.sourcePositionHarness.panel.captureSourcePosition().page),
  ).toBe(2);
  await page.evaluate(async () => {
    const harness = window.sourcePositionHarness;
    await harness.panel.restoreSourcePosition({ ...harness.saved!, page: -10 });
  });
  await expect(page.locator('source-annotation-panel .source-row[data-line="1"]')).toHaveCount(1);
  expect(
    await page.evaluate(() => window.sourcePositionHarness.panel.captureSourcePosition().page),
  ).toBe(0);
});

test("a restore waiting for initial scope setup cannot change a newly selected file", async ({
  page,
}) => {
  await mount(page);
  await rememberPosition(page);
  await page.evaluate(async () => {
    const harness = window.sourcePositionHarness;
    harness.panel = harness.makePanel();
    harness.lateRestore = harness.panel.restoreSourcePosition(harness.saved!);
    harness.panel.path = "src/new-scope.ts";
    await harness.lateRestore;
    await harness.settle();
  });
  const position = await page.evaluate(() =>
    window.sourcePositionHarness.panel.captureSourcePosition(),
  );
  expect(position).toMatchObject({
    page: 0,
    panelTop: 0,
    sourceTop: 0,
    sourceLeft: 0,
    composerOpen: false,
  });
  await expect(page.locator('source-annotation-panel .source-row[data-line="1"]')).toHaveCount(1);
  await expect(page.getByLabel("New annotation body")).toHaveCount(0);
  await expect(page.locator("source-annotation-panel .source-row.selected")).toHaveCount(0);
});

test("a late post-render restore cannot apply old scroll offsets to a new scope", async ({
  page,
}) => {
  await mount(page);
  await rememberPosition(page);
  const current = await page.evaluate(async () => {
    const harness = window.sourcePositionHarness;
    const panel = harness.panel;
    // First return to page zero so restoring page one schedules a Lit render.
    await panel.restoreSourcePosition({
      ...harness.saved!,
      page: 0,
      panelTop: 0,
      sourceTop: 0,
      sourceLeft: 0,
      composerOpen: false,
    });
    harness.lateRestore = panel.restoreSourcePosition(harness.saved!);
    // The restore's first continuation runs before this microtask; its second
    // continuation (after the page update) must re-check the scope fence.
    await Promise.resolve();
    panel.path = "src/late-scope.ts";
    await harness.lateRestore;
    await harness.settle();
    return panel.captureSourcePosition();
  });
  expect(current).toMatchObject({
    page: 0,
    panelTop: 0,
    sourceTop: 0,
    sourceLeft: 0,
    composerOpen: false,
  });
  await expect(page.locator('source-annotation-panel .source-row[data-line="1"]')).toHaveCount(1);
  await expect(page.getByLabel("New annotation body")).toHaveCount(0);
  await expect(page.locator("source-annotation-panel .source-row.selected")).toHaveCount(0);
});
