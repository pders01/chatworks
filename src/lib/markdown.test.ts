import { afterEach, describe, expect, test } from "bun:test";
import { setSyntaxHighlighter } from "./highlight.js";
import { renderMarkdown } from "./markdown.js";

afterEach(() => setSyntaxHighlighter(undefined));

describe("markdown syntax presentation", () => {
  test("preserves host syntax parts while stripping inline presentation", async () => {
    setSyntaxHighlighter(
      () =>
        '<pre class="host-code"><code><span part="syntax-token syntax-keyword" style="color:red">const</span></code></pre>',
    );

    const rendered = await renderMarkdown("```ts\nconst\n```");

    expect(rendered).toContain('part="syntax-token syntax-keyword"');
    expect(rendered).toContain('class="host-code"');
    expect(rendered).not.toContain("style=");
  });
});
