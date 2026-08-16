import { describe, expect, test } from "bun:test";
import { highlight, plainCodeHtml, setSyntaxHighlighter } from "./highlight.js";

describe("syntax presentation", () => {
  test("renders escaped, line-addressable code without inline presentation by default", async () => {
    const rendered = await highlight('<script class="x">&', "type script");

    expect(rendered).toBe(
      '<pre><code class="language-typescript"><span class="line">&lt;script class=&quot;x&quot;&gt;&amp;</span></code></pre>',
    );
    expect(rendered).not.toContain("style=");
  });

  test("allows an application to install and remove an explicit highlighter", async () => {
    const dispose = setSyntaxHighlighter(
      (code, language) => `<pre data-lang="${language}">${code}</pre>`,
    );
    expect(await highlight("const x = 1", "ts")).toBe('<pre data-lang="ts">const x = 1</pre>');

    dispose();
    expect(await highlight("plain", "txt")).toBe(plainCodeHtml("plain", "txt"));
  });
});
