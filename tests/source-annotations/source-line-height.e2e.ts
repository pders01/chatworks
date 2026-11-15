import { expect, test } from "playwright/test";

for (const highlighted of [false, true]) {
  test(`source line metrics stay uniform with blank lines and ${highlighted ? "highlighted" : "plain"} text`, async ({
    page,
  }) => {
    await page.goto("/fixture.html");
    await page.evaluate(async (highlighted) => {
      const viewport = document.createElement("meta");
      viewport.name = "viewport";
      viewport.content = "width=device-width, initial-scale=1";
      document.head.append(viewport);
      const entry = "/compiled-entry.js";
      await import(entry);
      const panel = document.createElement("source-annotation-panel");
      const ref = "a".repeat(40);
      Object.assign(panel, {
        path: "example.ts",
        ref,
        requestedRef: "main",
        active: true,
        sourceView: true,
        allowCreate: true,
        content: "const first = 1;\n\nreturn first;\n \n// end",
        maxLine: 5,
        highlightedLines: highlighted
          ? [
              '<span class="syntax-keyword">const</span> first = 1;',
              "",
              "return first;",
              " ",
              "// end",
            ]
          : [],
        scopeKey: "line-metrics",
        client: {
          async list() {
            return {
              ref,
              repositoryId: "repo",
              items: [
                {
                  annotation: {
                    id: "note",
                    repositoryId: "repo",
                    revision: 1,
                    createdAt: "2026-01-01T00:00:00Z",
                    updatedAt: "2026-01-01T00:00:00Z",
                    body: "First explanation line.\nSecond explanation line.\nThird explanation line.",
                    category: "explanation",
                    state: "open",
                    author: { kind: "human", name: "Reader" },
                    target: {
                      kind: "git",
                      commit: ref,
                      blob: ref,
                      path: "example.ts",
                      startLine: 1,
                      endLine: 1,
                      quote: { exact: "const first = 1;", prefix: "", suffix: "" },
                      fingerprint: "line",
                      whitespace: "exact",
                    },
                  },
                  placement: {
                    ref,
                    path: "example.ts",
                    status: "unchanged",
                    startLine: 1,
                    endLine: 1,
                  },
                },
              ],
            };
          },
        },
      });
      panel.style.height = "100dvh";
      document.body.replaceChildren(panel);
      await panel.updateComplete;
      await document.fonts.ready;
    }, highlighted);
    const panel = page.locator("source-annotation-panel");
    await expect(panel.locator(".virtual-annotation")).toContainText("Third explanation line.");
    const expectedHeight = 24; // Standalone default, no retired host token overrides.
    const metrics = await panel.locator(".source-row").evaluateAll((rows) =>
      rows.map((row) => {
        const gutter = row.querySelector<HTMLElement>(".gutter")!;
        const code = row.querySelector<HTMLElement>(".source-code")!;
        return {
          row: row.getBoundingClientRect().height,
          gutter: gutter.getBoundingClientRect().height,
          code: code.getBoundingClientRect().height,
          codeLine: getComputedStyle(code).lineHeight,
          gutterLine: getComputedStyle(gutter).lineHeight,
          codeTop: code.getBoundingClientRect().top,
          gutterTop: gutter.getBoundingClientRect().top,
        };
      }),
    );
    expect(metrics).toHaveLength(5);
    for (const item of metrics) {
      expect(item.row).toBe(expectedHeight);
      expect(item.code).toBe(expectedHeight);
      expect(item.gutter).toBe(expectedHeight);
      expect(item.codeLine).toBe(`${expectedHeight}px`);
      expect(item.gutterLine).toBe(item.codeLine);
      expect(item.gutterTop).toBe(item.codeTop);
    }
    const note = await panel.locator(".virtual-annotation").boundingBox();
    expect(note!.height).toBeGreaterThan(expectedHeight * 3);
    await panel.getByRole("button", { name: "Select line 2", exact: true }).click();
    await panel.getByRole("button", { name: "Add explanation", exact: true }).click();
    await expect(panel.getByLabel("New annotation body")).toBeVisible();
    expect(
      await panel
        .locator(".source-row")
        .evaluateAll((rows) =>
          rows.every(
            (row) => row.getBoundingClientRect().height === rows[0]!.getBoundingClientRect().height,
          ),
        ),
    ).toBe(true);
    const composer = (await panel.locator(".source-create").boundingBox())!;
    expect(composer.height).toBeGreaterThan(expectedHeight * 3);
  });
}
