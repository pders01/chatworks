// Consume the actual compiled package export, never a Vite source alias.
import { SourceAnnotationPanel } from "@jpahd/chatworks/source-annotations";
import { CONTENT, MemoryAnnotationClient, PATH, REF } from "./memory-client.js";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
const state = params.get("state") || "populated";
document.documentElement.dataset.theme = theme;
if (params.get("narrow") === "1") document.body.dataset.narrow = "";
(document.querySelector("#theme") as HTMLSelectElement).value = theme;
(document.querySelector("#state") as HTMLSelectElement).value = state;
(document.querySelector("#narrow") as HTMLInputElement).checked = params.get("narrow") === "1";

export const client = new MemoryAnnotationClient(
  ["empty", "empty-file", "long"].includes(state) ? [] : undefined,
);
client.failList = state === "error";
export const panel = new SourceAnnotationPanel();
const content =
  state === "empty-file"
    ? ""
    : state === "long"
      ? Array.from(
          { length: 1205 },
          (_, index) => `export const line${index + 1} = ${index + 1};`,
        ).join("\n")
      : CONTENT;

// Only escaped fragments from the synthetic source enter highlightedLines.
function highlight(line: string): string {
  const escaped = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  if (line.trimStart().startsWith("/**")) return `<span class="syntax-comment">${escaped}</span>`;
  return escaped.replace(
    /\b(type|export|function|const|return|new|if)\b/g,
    '<span class="syntax-keyword">$1</span>',
  );
}

Object.assign(panel, {
  client,
  scopeKey: "synthetic-example/account-a",
  path: PATH,
  ref: REF,
  requestedRef: "main",
  active: true,
  sourceView: true,
  allowCreate: true,
  readOnly: state === "readonly",
  content,
  maxLine: content ? content.trimEnd().split("\n").length : 0,
  highlightedLines: content.split("\n").map(highlight),
});
document.querySelector("#specimen")!.append(panel);

// Reproducible visual states use the same public interactions as a person.
// No private element state or arbitrary HTML injection is used by the demo.
export const ready = (async () => {
  await panel.updateComplete;
  await panel.updateComplete;
  if (state === "edit") {
    panel.shadowRoot!.querySelector<HTMLDetailsElement>(".note-details")!.open = true;
    const edit = [
      ...panel.shadowRoot!.querySelectorAll<HTMLButtonElement>(".virtual-annotation button"),
    ].find((button) => button.textContent?.trim() === "Edit")!;
    edit.click();
    await panel.updateComplete;
    panel
      .shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit annotation"]')!
      .focus();
  }
  if (state === "compose") {
    panel.shadowRoot!.querySelector<HTMLButtonElement>('.gutter[data-line="5"]')!.click();
    await panel.updateComplete;
    panel.shadowRoot!.querySelector<HTMLButtonElement>(".selection-tools button")!.click();
    await panel.updateComplete;
  }
  document.body.dataset.ready = "";
})();
