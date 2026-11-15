import { expect, test, type Page } from "playwright/test";

// Adapted notes-only and async invariants from annotations.e2e.ts. The fixture
// talks only to AnnotationClient and the compiled public component, never a host.
async function mount(page: Page, notesOnly = true) {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "");
  const panel = page.locator("source-annotation-panel");
  if (notesOnly)
    await panel.evaluate((element: any) => {
      element.sourceView = false;
    });
  return panel;
}

async function demo(page: Page, action: string) {
  // Browser ESM import kept dynamic so TypeScript does not resolve a server URL.
  return page.evaluate(async (action) => {
    const url = "/main.ts";
    const { panel, client } = await import(url);
    switch (action) {
      case "captureCreate": {
        const create = client.create.bind(client);
        client.create = (input: any) => {
          (window as any).created = input;
          return create(input);
        };
        break;
      }
      case "deferCreate": {
        const create = client.create.bind(client);
        client.create = (input: any) =>
          new Promise((resolve) => {
            (window as any).releaseCreate = async () => resolve(await create(input));
          });
        break;
      }
      case "deferList": {
        const list = client.list.bind(client);
        client.list = async (input: any) => {
          const snapshot = await list(input);
          return new Promise((resolve) => {
            (window as any).releaseList = () => resolve(snapshot);
          });
        };
        break;
      }
      case "failMutation":
        client.failMutation = true;
        break;
      case "resumeMutation":
        client.failMutation = false;
        break;
      case "replacePlacements": {
        const sample = structuredClone(client.items[0]);
        client.items = ["stale", "moved", "unplaced"].map((status) => ({
          ...structuredClone(sample),
          annotation: { ...sample.annotation, id: status },
          placement: {
            ...sample.placement,
            status,
            startLine: 4,
            endLine: 5,
            reason: status === "unplaced" ? "The anchor is ambiguous." : undefined,
          },
        }));
        break;
      }
      default:
        throw new Error(`Unknown fixture action ${action}`);
    }
    await panel.updateComplete;
  }, action);
}

test("notes-only categories, preview, immutable create payload, provenance and refresh", async ({
  page,
}) => {
  const panel = await mount(page);
  await expect(panel.getByText("Alex · example author · human").first()).toBeVisible();
  await expect(panel.getByText(/Original a7c841e93d50 · lines 8–10/)).toBeVisible();
  await panel.getByLabel("Annotation category filter").selectOption("review");
  await expect(panel.getByText("No annotations in this category.")).toBeVisible();
  await panel.getByLabel("Annotation category filter").selectOption("all");
  await panel.getByLabel("Annotation start line").fill("2");
  await panel.getByLabel("Annotation end line").fill("3");
  await expect(panel.getByLabel("Selected text preview")).toContainText(
    "A small, request-local cache.",
  );
  await panel.getByLabel("New annotation body").fill("Explain this data flow.");
  await demo(page, "captureCreate");
  await panel.getByRole("button", { name: "Save explanation" }).click();
  expect(await page.evaluate(() => (window as any).created)).toEqual({
    ref: "a7c841e93d504b2f8ea6921bd6c30598f12e407a",
    path: "src/cache/remember.ts",
    startLine: 2,
    endLine: 3,
    body: "Explain this data flow.",
    category: "explanation",
    whitespace: "exact",
  });
  await expect(panel.getByText("Explain this data flow.", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Refresh annotations" }).click();
  await expect(panel.getByText("Explain this data flow.", { exact: true })).toBeVisible();
});

test("notes-only placement wording never treats matching anchors as semantic validation", async ({
  page,
}) => {
  const panel = await mount(page);
  await demo(page, "replacePlacements");
  await panel.getByRole("button", { name: "Refresh annotations" }).click();
  for (const text of [
    "Stale anchor — source differs",
    "Moved anchor — review location",
    "Unplaced anchor — no safe match",
    "The anchor is ambiguous.",
  ]) {
    await expect(panel.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(panel.getByText(/does not validate meaning/).first()).toBeVisible();
  await expect(panel.getByText("Current src/cache/remember.ts · lines 4–5").first()).toBeVisible();
});

test("create and edit drafts survive inactive/active without leaking into another path", async ({
  page,
}) => {
  const panel = await mount(page);
  await panel.getByLabel("New annotation body").fill("Unsent create draft");
  await panel.getByRole("button", { name: "Edit", exact: true }).first().click();
  await panel.getByLabel("Edit annotation").fill("Unsent edit draft");
  await panel.evaluate(async (element: any) => {
    element.active = false;
    await element.updateComplete;
    element.active = true;
    await element.updateComplete;
  });
  await expect(panel.getByLabel("New annotation body")).toHaveValue("Unsent create draft");
  await expect(panel.getByLabel("Edit annotation")).toHaveValue("Unsent edit draft");
  await panel.evaluate(async (element: any) => {
    element.path = "other.ts";
    await element.updateComplete;
  });
  await expect(panel.getByLabel("New annotation body")).toHaveValue("");
  await panel.evaluate(async (element: any) => {
    element.path = "src/cache/remember.ts";
    await element.updateComplete;
  });
  await expect(panel.getByLabel("Edit annotation")).toHaveValue("Unsent edit draft");
  await expect(panel.getByLabel("New annotation body")).toHaveValue("Unsent create draft");
});

test("read-only mode is explicit and disables writes while keeping notes-only draft controls usable", async ({
  page,
}) => {
  const panel = await mount(page);
  await panel.evaluate((element: any) => {
    element.readOnly = true;
  });
  await expect(panel.getByText("Read only", { exact: true })).toBeVisible();
  for (const name of ["Edit", "Resolve", "Delete", "Save explanation"]) {
    await expect(panel.getByRole("button", { name, exact: true }).first()).toBeDisabled();
  }
  await expect(panel.getByLabel("New annotation body")).toBeEnabled();
  await expect(panel.getByLabel("Annotation start line")).toHaveAttribute("inputmode", "numeric");
});

test("a refresh received before mutation acceptance cannot discard the accepted creation", async ({
  page,
}) => {
  const panel = await mount(page);
  await demo(page, "deferCreate");
  await panel.getByLabel("New annotation body").fill("New local item");
  await panel.getByRole("button", { name: "Save explanation" }).click();
  await panel.getByRole("button", { name: "Refresh annotations" }).click();
  await expect(panel.locator(".item")).toHaveCount(3);
  await page.evaluate(async () => (window as any).releaseCreate());
  await expect(panel.getByText("New local item", { exact: true })).toBeVisible();
});

test("mutation errors preserve draft, announce failure, and allow retry", async ({ page }) => {
  const panel = await mount(page);
  await demo(page, "failMutation");
  await panel.getByLabel("New annotation body").fill("Retry this explanation");
  await panel.getByRole("button", { name: "Save explanation" }).click();
  await expect(panel.getByRole("alert")).toContainText("Your draft is preserved");
  await expect(panel.getByLabel("New annotation body")).toHaveValue("Retry this explanation");
  await expect(panel.getByRole("button", { name: "Save explanation" })).toBeEnabled();
  await demo(page, "resumeMutation");
  await panel.getByRole("button", { name: "Save explanation" }).click();
  await expect(panel.getByText("Retry this explanation", { exact: true })).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("disconnect fences mutation events and keeps the unsent draft available on remount", async ({
  page,
}) => {
  const panel = await mount(page);
  await demo(page, "deferCreate");
  await panel.getByLabel("New annotation body").fill("Draft before disconnect");
  await panel.getByRole("button", { name: "Save explanation" }).click();
  const result = await page.evaluate(async () => {
    const panel = document.querySelector("source-annotation-panel") as any;
    let events = 0;
    panel.addEventListener("source-annotations-changed", () => {
      events++;
    });
    const replacement = document.createElement("source-annotation-panel") as any;
    for (const key of [
      "client",
      "scopeKey",
      "path",
      "ref",
      "requestedRef",
      "active",
      "allowCreate",
      "content",
      "maxLine",
    ])
      replacement[key] = panel[key];
    panel.remove();
    await (window as any).releaseCreate();
    document.body.append(replacement);
    await replacement.updateComplete;
    return events;
  });
  expect(result).toBe(0);
  await expect(panel.getByLabel("New annotation body")).toHaveValue("Draft before disconnect");
});

test("stale refresh results after deactivation cannot repopulate the next active scope", async ({
  page,
}) => {
  const panel = await mount(page);
  await demo(page, "deferList");
  await panel.getByRole("button", { name: "Refresh annotations" }).click();
  await panel.evaluate(async (element: any) => {
    element.active = false;
    await element.updateComplete;
    element.scopeKey = "new-scope";
    element.client = { list: async () => ({ ref: element.ref, repositoryId: "other", items: [] }) };
    element.active = true;
    await element.updateComplete;
  });
  await page.evaluate(() => (window as any).releaseList());
  await expect(panel.locator(".item")).toHaveCount(0);
  await expect(panel.getByText("No annotations in this category.")).toBeVisible();
});

test("resolve, reopen and delete send the currently displayed optimistic revision", async ({
  page,
}) => {
  const panel = await mount(page);
  const item = panel.locator(".item").first();
  await item.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(item.getByRole("button", { name: "Reopen", exact: true })).toBeVisible();
  await expect(item.locator(".provenance")).toContainText("revision 2");
  await item.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(item.locator(".provenance")).toContainText("revision 3");
  await item.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(panel.locator(".item")).toHaveCount(2);
});

test("WORKTREE disallows original anchors and source read-only mode retains selection and provenance", async ({
  page,
}) => {
  const panel = await mount(page, false);
  await panel.evaluate((element: any) => {
    element.ref = "WORKTREE";
    element.readOnly = true;
  });
  await expect(panel.getByText("Read only", { exact: true })).toBeVisible();
  await panel.locator(".source-context summary").click();
  await expect(panel.getByText("Working tree (not index/diff side)")).toBeVisible();
  await panel.getByRole("button", { name: "Select line 1", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Add explanation", exact: true })).toHaveCount(0);
  await panel.evaluate((element: any) => {
    element.sourceView = false;
  });
  await expect(
    panel.getByText(
      "Working tree notes can be read or managed, but cannot create original anchors.",
    ),
  ).toBeVisible();
});

test("plain source, annotation bodies and errors remain text, never interpreted markup", async ({
  page,
}) => {
  const panel = await mount(page);
  const markup = '<img src=x onerror="window.injected=true">';
  await panel.getByLabel("New annotation body").fill(markup);
  await panel.getByRole("button", { name: "Save explanation" }).click();
  await expect(panel.locator(".body").filter({ hasText: markup })).toHaveText(markup);
  await expect(panel.locator("img")).toHaveCount(0);
  await panel.evaluate((element: any) => {
    element.sourceView = true;
    const markup = '<img src=x onerror="window.injected=true">';
    element.highlightedLines = [];
    element.content = markup;
    element.scopeKey = "text-safety";
    element.client = {
      list: async () => {
        throw new Error(markup);
      },
    };
  });
  await expect(panel.locator(".source-code")).toHaveText(
    '<img src=x onerror="window.injected=true">',
  );
  await expect(panel.getByRole("alert")).toHaveText('<img src=x onerror="window.injected=true">');
  await expect(panel.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
});
