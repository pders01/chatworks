import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnnotationService } from "@jpahd/source-annotations";
import type {
  AnnotationClient,
  AnnotationCreate,
  AnnotationQuery,
} from "@jpahd/source-annotations/contracts";
import { expect, test, type Page } from "playwright/test";

const originalPath = "source.txt";
const renamedPath = "renamed.txt";
const quote = "const note = 1;";
const source = `// A private note belongs to the original Git blob.\n${quote}\n// Keep this neighboring line through the rename.\n// And keep another line to make the rename recognizable.\n`;

declare global {
  interface Window {
    listFixtureAnnotations: AnnotationClient["list"];
    createFixtureAnnotation: AnnotationClient["create"];
  }
}

test("a host-backed note moves with committed source without rewriting its anchor", async ({
  page,
}) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "chatworks-git-placement-")));
  try {
    const root = join(directory, "repository");
    await mkdir(root);
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          HOME: directory,
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_TERMINAL_PROMPT: "0",
        },
      });
    const commit = (message: string) => {
      git("add", "--all");
      git("commit", "--quiet", "-m", message);
      return git("rev-parse", "HEAD").trimEnd();
    };
    git("init", "--quiet", "-b", "main");
    git("config", "user.name", "Browser Fixture");
    git("config", "user.email", "browser@example.invalid");
    await writeFile(join(root, originalPath), source);
    const original = commit("Original source");

    // The browser sees a client bound to this disposable repository. It never
    // imports native Git or chooses the filesystem location or author identity.
    const service = new AnnotationService(join(directory, "private-notes"));
    await page.exposeFunction("listFixtureAnnotations", (query: AnnotationQuery) =>
      service.list(root, query),
    );
    await page.exposeFunction("createFixtureAnnotation", (input: AnnotationCreate) =>
      service.create(root, input, { kind: "human", name: "Browser Fixture" }),
    );
    await mount(page);
    const view = async (ref: string, path: string) => {
      const content = git("show", `${ref}:${path}`).replace(/\n$/, "");
      await page
        .locator("source-annotation-panel")
        .evaluate((element, snapshot) => Object.assign(element, snapshot), {
          ref,
          path,
          content,
          maxLine: content.split("\n").length,
        });
    };

    const panel = page.locator("source-annotation-panel");
    const inline = panel.locator(".virtual-annotation");
    await view(original, originalPath);
    await panel.getByRole("button", { name: "Select line 2", exact: true }).click();
    await panel.getByRole("button", { name: "Add explanation", exact: true }).click();
    await panel.getByLabel("New annotation body").fill("A note on the original value.");
    await panel.getByRole("button", { name: "Save explanation", exact: true }).click();
    await expect(inline).toContainText("A note on the original value.");
    const [created] = (await service.export(root)).annotations;
    expect(created.target).toMatchObject({ commit: original, path: originalPath, startLine: 2 });

    const inserted = `// An inserted line.\n${source}`;
    await writeFile(join(root, originalPath), inserted);
    await view(commit("Insert a line before the note"), originalPath);
    await expect(inline).toContainText("After line 3 · moved");

    git("mv", "--", originalPath, renamedPath);
    await view(commit("Rename the annotated source"), renamedPath);
    await expect(panel.getByRole("heading", { name: renamedPath })).toBeVisible();
    await expect(inline).toContainText("After line 3 · moved");

    await writeFile(join(root, renamedPath), inserted.replace(quote, "const note = 2;"));
    await view(commit("Change the annotated text"), renamedPath);
    await expect(inline).toHaveCount(0);
    await expect(panel.getByText("Notes not placed in this source (1)")).toBeVisible();
    expect((await service.export(root)).annotations).toEqual([created]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function mount(page: Page) {
  await page.goto("/fixture.html");
  await page.evaluate(async () => {
    const entry = "/compiled-entry.js";
    await import(entry);
    const client: AnnotationClient = {
      list: window.listFixtureAnnotations,
      create: window.createFixtureAnnotation,
      update: async () => {
        throw new Error("Update is not part of this fixture");
      },
      delete: async () => {
        throw new Error("Delete is not part of this fixture");
      },
    };
    const panel = document.createElement("source-annotation-panel");
    Object.assign(panel, {
      client,
      scopeKey: "disposable-git-fixture",
      requestedRef: "main",
      sourceView: true,
      active: true,
      allowCreate: true,
    });
    document.body.append(panel);
  });
}
