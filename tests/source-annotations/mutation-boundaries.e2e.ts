import { expect, test, type Page } from "playwright/test";
import type { AnnotationClient, SourceAnnotation } from "@jpahd/source-annotations/contracts";

const REF_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const REF_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PATH = "src/example.ts";
type Authority = "a" | "b";
type Panel = HTMLElement & {
  client: AnnotationClient;
  scopeKey: string;
  path: string;
  ref: string;
  requestedRef: string;
  active: boolean;
  readOnly: boolean;
  updateComplete: Promise<unknown>;
};
interface Request {
  authority: Authority;
  method: string;
  params: Record<string, unknown>;
}
interface Pending extends Request {
  resolve(value: unknown): void;
  reject(error: Error): void;
}
interface Harness {
  clients: Record<Authority, AnnotationClient>;
  requests: Request[];
  pending: Pending[];
  changes: number;
}
declare global {
  interface Window {
    mutationBoundariesHarness: Harness;
  }
}

function annotation(overrides: Partial<SourceAnnotation> = {}): SourceAnnotation {
  return {
    id: "shared-note-id",
    repositoryId: "synthetic-repository",
    revision: 7,
    createdAt: "2025-01-02T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    author: { kind: "human", name: "Synthetic author" },
    body: "Original explanation",
    category: "explanation",
    state: "open",
    target: {
      kind: "git",
      commit: REF_A,
      blob: "synthetic-blob",
      path: PATH,
      startLine: 1,
      endLine: 1,
      quote: { exact: "const example = 1;", prefix: "", suffix: "" },
      fingerprint: "synthetic-fingerprint",
      whitespace: "exact",
    },
    ...overrides,
  };
}

async function mount(
  page: Page,
  sourceView: boolean,
  options: { mismatch?: boolean; resolved?: boolean; deferList?: boolean } = {},
): Promise<void> {
  await page.goto("/fixture.html");
  await page.evaluate(
    async ({ sourceView, note, ref, path, options }) => {
      // The fixture imports the built public package export, never a source alias.
      const entry = "/compiled-entry.js";
      await import(entry);
      const requests: Request[] = [];
      const pending: Pending[] = [];
      const clients = Object.fromEntries(
        (["a", "b"] as const).map((authority) => [
          authority,
          Object.fromEntries(
            ["list", "create", "update", "delete"].map((method) => [
              method,
              (params: Record<string, unknown>) => {
                const request = { authority, method, params };
                requests.push(request);
                if (method === "list" && !options.deferList) {
                  const responseRef = options.mismatch
                    ? "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                    : String(params.ref);
                  return Promise.resolve({
                    repositoryId: "synthetic-repository",
                    ref: responseRef,
                    items: [
                      {
                        annotation: note,
                        placement: {
                          status: "unchanged",
                          ref: responseRef,
                          path: params.path,
                          startLine: 1,
                          endLine: 1,
                        },
                      },
                    ],
                  });
                }
                return new Promise((resolve, reject) =>
                  pending.push({ ...request, resolve, reject }),
                );
              },
            ]),
          ),
        ]),
      ) as unknown as Record<Authority, AnnotationClient>;
      const harness: Harness = { clients, requests, pending, changes: 0 };
      window.mutationBoundariesHarness = harness;
      const panel = document.createElement("source-annotation-panel") as Panel;
      Object.assign(panel, {
        client: clients.a,
        scopeKey: "scope-a",
        path,
        ref,
        requestedRef: "main",
        active: true,
        allowCreate: true,
        content: "const example = 1;\nreturn example;",
        maxLine: 2,
        sourceView,
      });
      panel.addEventListener("source-annotations-changed", () => ++harness.changes);
      document.body.replaceChildren(panel);
      await panel.updateComplete;
    },
    {
      sourceView,
      note: annotation({ state: options.resolved ? "resolved" : "open" }),
      ref: REF_A,
      path: PATH,
      options,
    },
  );
  if (!options.mismatch && !options.deferList)
    await expect(page.locator("[data-annotation-id]")).toHaveCount(1);
}

async function switchAuthority(page: Page, authority: Authority): Promise<void> {
  await page.evaluate(async (authority) => {
    const panel = document.querySelector("source-annotation-panel") as Panel;
    Object.assign(panel, {
      client: window.mutationBoundariesHarness.clients[authority],
      scopeKey: `scope-${authority}`,
    });
    await panel.updateComplete;
  }, authority);
  await expect(page.locator("[data-annotation-id]")).toHaveCount(1);
}

async function openDetails(page: Page, sourceView: boolean): Promise<void> {
  if (sourceView) await page.locator(".note-details > summary").click();
}

async function edit(page: Page, sourceView: boolean, body: string): Promise<void> {
  await openDetails(page, sourceView);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Edit annotation", { exact: true }).fill(body);
}

async function compose(page: Page, sourceView: boolean, body: string): Promise<void> {
  if (sourceView) {
    await page.getByRole("button", { name: "Select line 1", exact: true }).click();
    await page.getByRole("button", { name: "Add explanation", exact: true }).click();
  }
  await page.getByLabel("New annotation body", { exact: true }).fill(body);
}

async function mutations(page: Page): Promise<Request[]> {
  return page.evaluate(() =>
    window.mutationBoundariesHarness.requests.filter((request) => request.method !== "list"),
  );
}

async function finish(page: Page, method: string, value: unknown, reject = false): Promise<void> {
  await page.evaluate(
    ({ method, value, reject }) => {
      const harness = window.mutationBoundariesHarness;
      const index = harness.pending.findIndex((request) => request.method === method);
      if (index < 0) throw new Error(`No pending ${method}`);
      const request = harness.pending.splice(index, 1)[0]!;
      if (reject) request.reject(new Error("Synthetic retryable failure"));
      else request.resolve(value);
    },
    { method, value, reject },
  );
}

for (const sourceView of [false, true]) {
  const view = sourceView ? "source" : "notes-only";

  for (const action of ["Save edit", "Resolve", "Reopen", "Delete", "Edit"] as const) {
    test(`${view}: stale ${action} cannot act under newly assigned client and scope before render`, async ({
      page,
    }) => {
      await mount(page, sourceView, { resolved: action === "Reopen" });
      if (action === "Save edit") await edit(page, sourceView, "Scope A edit");
      else await openDetails(page, sourceView);
      await page.evaluate((action) => {
        const panel = document.querySelector("source-annotation-panel") as Panel;
        const button = [...panel.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")].find(
          (button) => button.textContent?.trim() === action,
        )!;
        Object.assign(panel, {
          client: window.mutationBoundariesHarness.clients.b,
          scopeKey: "scope-b",
        });
        // Deliberately no await/updateComplete between property assignment and click.
        button.click();
      }, action);
      expect(await mutations(page)).toEqual([]); // Neither authority may receive A's ID/revision.
      await expect(page.getByLabel("Edit annotation", { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => window.mutationBoundariesHarness.changes)).toBe(0);
    });
  }

  for (const field of ["client", "scopeKey", "path", "ref", "requestedRef"] as const) {
    test(`${view}: ${field} alone invalidates a rendered delete`, async ({ page }) => {
      await mount(page, sourceView);
      await openDetails(page, sourceView);
      await page.evaluate(
        ({ field, ref }) => {
          const panel = document.querySelector("source-annotation-panel") as Panel;
          const button = panel.shadowRoot!.querySelector<HTMLButtonElement>(".danger")!;
          if (field === "client") panel.client = window.mutationBoundariesHarness.clients.b;
          else panel[field] = field === "ref" ? ref : "other-scope-value";
          button.click();
        },
        { field, ref: REF_B },
      );
      expect(await mutations(page)).toEqual([]);
    });
  }

  test(`${view}: stale create inputs and submit cannot overwrite the new authority's draft`, async ({
    page,
  }) => {
    await mount(page, sourceView);
    await switchAuthority(page, "b");
    await compose(page, sourceView, "Preserve B creation draft");
    await switchAuthority(page, "a");
    await compose(page, sourceView, "Preserve A creation draft");
    await page.evaluate(() => {
      const panel = document.querySelector("source-annotation-panel") as Panel;
      const root = panel.shadowRoot!;
      const form = root.querySelector<HTMLFormElement>("form")!;
      const input = root.querySelector<HTMLTextAreaElement>('[aria-label="New annotation body"]')!;
      const category = root.querySelector<HTMLSelectElement>(
        '[aria-label="New annotation category"]',
      )!;
      Object.assign(panel, {
        client: window.mutationBoundariesHarness.clients.b,
        scopeKey: "scope-b",
      });
      input.value = "Stale A input must not become B";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      category.value = "question";
      category.dispatchEvent(new Event("change", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(await mutations(page)).toEqual([]);
    if (sourceView) {
      await page.getByRole("button", { name: "Select line 1", exact: true }).click();
      await page.getByRole("button", { name: "Add explanation", exact: true }).click();
    }
    await expect(page.getByLabel("New annotation body", { exact: true })).toHaveValue(
      "Preserve B creation draft",
    );
    await expect(page.getByLabel("New annotation category", { exact: true })).toHaveValue(
      "explanation",
    );
    await switchAuthority(page, "a");
    if (sourceView) {
      await page.getByRole("button", { name: "Select line 1", exact: true }).click();
      await page.getByRole("button", { name: "Add explanation", exact: true }).click();
    }
    await expect(page.getByLabel("New annotation body", { exact: true })).toHaveValue(
      "Preserve A creation draft",
    );
  });

  test(`${view}: stale edit input and Cancel cannot erase the new authority's edit draft`, async ({
    page,
  }) => {
    await mount(page, sourceView);
    await switchAuthority(page, "b");
    await edit(page, sourceView, "Preserve B edit draft");
    await switchAuthority(page, "a");
    await edit(page, sourceView, "Preserve A edit draft");
    await page.evaluate(() => {
      const panel = document.querySelector("source-annotation-panel") as Panel;
      const input = panel.shadowRoot!.querySelector<HTMLTextAreaElement>(
        '[aria-label="Edit annotation"]',
      )!;
      const cancel = [...panel.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === "Cancel",
      )!;
      Object.assign(panel, {
        client: window.mutationBoundariesHarness.clients.b,
        scopeKey: "scope-b",
      });
      input.value = "Stale A edit";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      cancel.click();
    });
    await expect(page.getByLabel("Edit annotation", { exact: true })).toHaveValue(
      "Preserve B edit draft",
    );
    expect(await mutations(page)).toEqual([]);
    await switchAuthority(page, "a");
    await expect(page.getByLabel("Edit annotation", { exact: true })).toHaveValue(
      "Preserve A edit draft",
    );
  });

  for (const operation of ["edit", "create"] as const) {
    for (const reject of [false, true]) {
      test(`${view}: pending ${operation} locks all draft controls and ignores synthetic late input (${reject ? "failure" : "success"})`, async ({
        page,
      }) => {
        await mount(page, sourceView);
        if (operation === "edit") await edit(page, sourceView, "Submitted A");
        else await compose(page, sourceView, "Submitted A");
        const label = operation === "edit" ? "Edit annotation" : "New annotation body";
        const selector = operation === "edit" ? "[data-annotation-id]" : "form";
        await page.evaluate(
          ({ label, operation, selector }) => {
            const panel = document.querySelector("source-annotation-panel") as Panel;
            const container = panel.shadowRoot!.querySelector(selector)!;
            const input = container.querySelector<HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
            const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
              (button) =>
                button.textContent?.trim() ===
                (operation === "edit" ? "Save edit" : "Save explanation"),
            )!;
            button.click();
            // Also test the interval before Lit has disabled the existing DOM controls.
            input.value = "Programmatic B before render";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            const category = container.querySelector<HTMLSelectElement>("select")!;
            category.value = "review";
            category.dispatchEvent(new Event("change", { bubbles: true }));
          },
          { label, operation, selector },
        );
        const container = page.locator(selector);
        for (const control of await container.locator("textarea, input, select").all())
          await expect(control).toBeDisabled();
        const request = (await mutations(page))[0]!;
        expect(request.params).toMatchObject({ body: "Submitted A", category: "explanation" });
        expect(await mutations(page)).toHaveLength(1);
        // Native input must be blocked too; then dispatch directly despite disabled.
        await page.keyboard.type("User B while pending");
        await page.evaluate(
          ({ selector, label }) => {
            const panel = document.querySelector("source-annotation-panel") as Panel;
            const container = panel.shadowRoot!.querySelector(selector)!;
            const input = container.querySelector<HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
            input.value = "Programmatic B after render";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            for (const control of container.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
              "input, select",
            )) {
              control.value =
                control instanceof HTMLSelectElement
                  ? control.options[control.options.length - 1]!.value
                  : "2";
              control.dispatchEvent(
                new Event(control instanceof HTMLSelectElement ? "change" : "input", {
                  bubbles: true,
                }),
              );
            }
          },
          { selector, label },
        );
        await finish(
          page,
          operation === "edit" ? "update" : "create",
          annotation({ body: "Submitted A", revision: 8 }),
          reject,
        );
        if (reject) await expect(page.getByRole("alert")).toHaveText("Synthetic retryable failure");
        else {
          await expect(page.locator(".body").filter({ hasText: "Submitted A" })).toBeVisible();
          expect(await page.evaluate(() => window.mutationBoundariesHarness.changes)).toBe(1);
        }
        if (!reject && operation === "edit") return;
        // Recreate controls from cached state, rather than inspecting a DOM value
        // that a synthetic event itself can change even when its handler rejects it.
        await page.evaluate(async () => {
          const panel = document.querySelector("source-annotation-panel") as Panel;
          panel.active = false;
          await panel.updateComplete;
          panel.active = true;
          await panel.updateComplete;
        });
        if (sourceView && !reject) {
          await page.getByRole("button", { name: "Select line 1", exact: true }).click();
          await page.getByRole("button", { name: "Add explanation", exact: true }).click();
        }
        if (reject || operation === "create") {
          await expect(page.getByLabel(label, { exact: true })).toHaveValue(
            reject ? "Submitted A" : "",
          );
          await expect(page.locator(selector).locator("select").first()).toHaveValue("explanation");
          if (!sourceView && operation === "create") {
            await expect(page.getByLabel("Annotation start line", { exact: true })).toHaveValue(
              "1",
            );
            await expect(page.getByLabel("Annotation end line", { exact: true })).toHaveValue("1");
          }
        }
      });
    }
  }

  test(`${view}: synchronous read-only change rejects an old enabled mutation button`, async ({
    page,
  }) => {
    await mount(page, sourceView);
    await openDetails(page, sourceView);
    await page.evaluate(() => {
      const panel = document.querySelector("source-annotation-panel") as Panel;
      const button = panel.shadowRoot!.querySelector<HTMLButtonElement>(".danger")!;
      panel.readOnly = true;
      button.click();
    });
    expect(await mutations(page)).toEqual([]);
  });

  test(`${view}: current wrong-SHA list is an explicit mismatch, not a successful empty state`, async ({
    page,
  }) => {
    await mount(page, sourceView, { mismatch: true });
    await expect(page.getByRole("alert")).toContainText("snapshot mismatch");
    await expect(page.locator("[data-annotation-id]")).toHaveCount(0);
    await expect(page.getByText(/No notes yet|No annotations in this category/)).toHaveCount(0);
    await expect(page.getByText("Loading annotations…")).toHaveCount(0);
  });

  test(`${view}: superseded wrong-SHA list remains silent`, async ({ page }) => {
    await mount(page, sourceView, { deferList: true });
    await page.evaluate(async () => {
      const panel = document.querySelector("source-annotation-panel") as Panel;
      Object.assign(panel, {
        client: window.mutationBoundariesHarness.clients.b,
        scopeKey: "scope-b",
      });
      await panel.updateComplete;
    });
    await finish(page, "list", { repositoryId: "synthetic-repository", ref: REF_B, items: [] });
    await expect(page.getByRole("alert")).toHaveCount(0);
    await finish(page, "list", { repositoryId: "synthetic-repository", ref: REF_A, items: [] });
    await expect(
      page.getByText(
        sourceView
          ? "No notes yet. The source speaks for itself."
          : "No annotations in this category.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test(`${view}: an obsolete A save cannot clear an ABA save's busy token or draft`, async ({
    page,
  }) => {
    await mount(page, sourceView);
    await edit(page, sourceView, "First A save");
    await page.getByRole("button", { name: "Save edit", exact: true }).click();
    await switchAuthority(page, "b");
    await edit(page, sourceView, "B isolated draft");
    await switchAuthority(page, "a");
    await page.getByLabel("Edit annotation", { exact: true }).fill("Second A save");
    await page.getByRole("button", { name: "Save edit", exact: true }).click();
    await finish(page, "update", annotation({ body: "First A save", revision: 8 }));
    await expect(page.getByRole("button", { name: "Save edit", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Edit annotation", { exact: true })).toHaveValue("Second A save");
    expect(await page.evaluate(() => window.mutationBoundariesHarness.changes)).toBe(0);
    await finish(page, "update", annotation({ body: "Second A save", revision: 9 }));
    await expect(page.locator(".body").filter({ hasText: "Second A save" })).toBeVisible();
    expect(await page.evaluate(() => window.mutationBoundariesHarness.changes)).toBe(1);
    await switchAuthority(page, "b");
    await expect(page.getByLabel("Edit annotation", { exact: true })).toHaveValue(
      "B isolated draft",
    );
  });
}

test("source-only reading without an annotation client retains cross-page keyboard selection and focus", async ({
  page,
}) => {
  await mount(page, true);
  await page.evaluate(async () => {
    const panel = document.querySelector("source-annotation-panel") as Panel;
    Object.assign(panel, {
      client: undefined,
      allowCreate: false,
      showAnnotations: false,
      content: Array.from({ length: 502 }, (_, index) => `line ${index + 1}`).join("\n"),
      maxLine: 502,
    });
    await panel.updateComplete;
  });
  await page.getByRole("button", { name: "Select line 500", exact: true }).click();
  await page.keyboard.press("Shift+ArrowDown");
  const nextLine = page.getByRole("button", { name: "Select line 501", exact: true });
  await expect(nextLine).toBeFocused();
  await expect(nextLine).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".source-row")).toHaveCount(2);
  expect(await mutations(page)).toEqual([]);
});
