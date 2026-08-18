import { afterEach, describe, expect, test } from "bun:test";
import { CwAttachment } from "./attachment.js";
import type { AttachmentInfo } from "../lib/chat-types.js";

const file: AttachmentInfo = {
  filename: "notes.md",
  mimeType: "text/markdown",
  size: 2_048,
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("cw-attachment", () => {
  test("renders nothing without attachment data", async () => {
    const attachment = new CwAttachment();
    document.body.append(attachment);
    await attachment.updateComplete;

    expect(attachment.shadowRoot?.childElementCount).toBe(0);
  });

  test("renders semantic file information and stable parts", async () => {
    const attachment = new CwAttachment();
    attachment.attachment = file;
    attachment.listItem = true;
    document.body.append(attachment);
    await attachment.updateComplete;

    const item = attachment.shadowRoot?.querySelector<HTMLElement>(".attachment-chip");
    expect(item?.getAttribute("role")).toBe("listitem");
    expect(item?.getAttribute("part")).toContain("attachment-chip");
    expect(item?.getAttribute("part")).toContain("is-file");
    expect(attachment.shadowRoot?.querySelector("[part='attachment-name']")?.textContent).toBe(
      "notes.md",
    );
    expect(attachment.shadowRoot?.querySelector("[part='attachment-size']")?.textContent).toBe(
      "2.0KB",
    );
  });

  test("renders image attachments with useful alternative text", async () => {
    const attachment = new CwAttachment();
    attachment.attachment = {
      filename: "board.png",
      mimeType: "image/png",
      size: 10,
      url: "blob:board",
    };
    document.body.append(attachment);
    await attachment.updateComplete;

    const image = attachment.shadowRoot?.querySelector<HTMLImageElement>("img");
    expect(image?.alt).toBe("board.png");
    expect(image?.getAttribute("part")).toBe("attachment-thumb");
  });

  test("requests removal without owning attachment state", async () => {
    const attachment = new CwAttachment();
    attachment.attachment = file;
    attachment.removable = true;
    document.body.append(attachment);
    await attachment.updateComplete;

    let detail: AttachmentInfo | undefined;
    attachment.addEventListener("gc:remove-attachment", (event) => {
      detail = event.detail.attachment;
    });
    attachment.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();

    expect(detail).toBe(file);
    expect(attachment.attachment).toBe(file);
  });
});
