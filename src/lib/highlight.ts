export type SyntaxHighlighter = (code: string, language: string) => string | Promise<string>;

let syntaxHighlighter: SyntaxHighlighter | undefined;

/**
 * Configure syntax presentation for Chatworks code paths.
 *
 * Chatworks renders escaped, uncolored code by default. Applications that want
 * syntax colors can install a trusted highlighter explicitly. The returned
 * cleanup only removes the highlighter when it is still the active one.
 */
export function setSyntaxHighlighter(highlighter?: SyntaxHighlighter): () => void {
  syntaxHighlighter = highlighter;
  return () => {
    if (syntaxHighlighter === highlighter) syntaxHighlighter = undefined;
  };
}

/** Render code through the host highlighter, or as structural plain HTML. */
export async function highlight(code: string, language: string): Promise<string> {
  if (syntaxHighlighter) return syntaxHighlighter(code, language);
  return plainCodeHtml(code, language);
}

/**
 * Return the line-wrapped shape consumed by previews and diff transforms,
 * without inline styles or component-owned syntax colors.
 */
export function plainCodeHtml(code: string, language = "plaintext"): string {
  const className = `language-${language.replace(/[^a-zA-Z0-9_-]/g, "") || "plaintext"}`;
  const lines = code.replace(/\r\n?/g, "\n").split("\n");
  const body = lines.map((line) => `<span class="line">${escapeHtml(line)}</span>`).join("\n");
  return `<pre><code class="${className}">${body}</code></pre>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
