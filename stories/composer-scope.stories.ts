import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { expect, fn, waitFor } from "storybook/test";
import { html } from "lit";
import { GcComposer } from "../src/components/chat-view/composer.js";
import { EntryType, type FilePreview, type RepoHost } from "../src/host.js";
import { CwStoryHost, createStoryRepoHost } from "./support/story-host.js";

void GcComposer;
void CwStoryHost;

const meta = {
  title: "Inputs/Composer/Repository scope",
  component: "cw-composer",
  render: () => html`
    <cw-story-host>
      <div class="story-frame constrained centered">
        <!-- Inline-size containers need a host-owned width in a centered grid. -->
        <cw-composer style="width: min(100%, 860px)" .repoId=${"draft:current"}></cw-composer>
      </div>
    </cw-story-host>
  `,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function tree(name: string) {
  return {
    entries: [{ name, type: EntryType.FILE, size: 10n, blobSha: "test" }],
    refResolved: "main",
  };
}

function preview(content: string): FilePreview {
  return { path: "shared.txt", content, size: 10n, binary: false, truncated: false };
}

function repo(content = "current contents") {
  return {
    ...createStoryRepoHost(),
    listTree: fn(async () => tree("shared.txt")),
    listBranches: fn(async () => ({ branches: [], tags: [] })),
    getFilePreview: fn(async () => preview(content)),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function fixture(canvas: HTMLElement) {
  const host = canvas.querySelector<CwStoryHost>("cw-story-host")!;
  const composer = canvas.querySelector<GcComposer>("cw-composer")!;
  await host.updateComplete;
  await composer.updateComplete;
  const textarea = composer.shadowRoot!.querySelector("textarea")!;
  const root = composer.shadowRoot!;
  const setRepo = async (value: RepoHost) => {
    host.repoHost = value;
    await host.updateComplete;
    await composer.updateComplete;
  };
  const type = async (value: string) => {
    textarea.focus();
    textarea.value = value;
    textarea.setSelectionRange(value.length, value.length);
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    await composer.updateComplete;
  };
  return { composer, textarea, root, setRepo, type };
}

export const DisabledDraftAndAllocation: Story = {
  play: async ({ canvasElement }) => {
    const { composer, textarea, root, setRepo, type } = await fixture(canvasElement);
    const host = repo();
    await setRepo(host);
    await expect(composer.fileMentionsDisabled).toBe(false);
    composer.fileMentionsDisabled = true;
    composer.repoId = "draft:general";
    await composer.updateComplete;
    for (const text of ["Review @", "/diff HEAD ", "/diff "]) await type(text);
    await expect(host.listTree).not.toHaveBeenCalled();
    await expect(host.listBranches).not.toHaveBeenCalled();
    await expect(host.getFilePreview).not.toHaveBeenCalled();
    await expect(root.querySelector(".mention-picker, .arg-list")).toBeNull();
    await type("/");
    await expect(root.querySelector(".slash-list")).not.toBeNull();

    const files = new DataTransfer();
    files.items.add(new File(["notes"], "notes.txt", { type: "text/plain" }));
    const picker = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    picker.files = files.files;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => expect(root.querySelector("cw-attachment")).not.toBeNull());
    const attachment = root.querySelector("cw-attachment");
    await type("Review @shared");
    composer.repoId = "allocated-session";
    composer.fileMentionsDisabled = false;
    await composer.updateComplete;
    await expect(textarea.value).toBe("Review @shared");
    await expect(root.activeElement).toBe(textarea);
    await expect(textarea.selectionStart).toBe(textarea.value.length);
    await expect(root.querySelector("cw-attachment")).toBe(attachment);
    await expect(host.listTree).not.toHaveBeenCalled();
    await type(textarea.value);
    await waitFor(() =>
      expect(root.querySelector(".preview-code")?.textContent).toContain("current contents"),
    );
    await expect(host.listTree).toHaveBeenCalledWith({ repoId: "allocated-session", path: "" });
    await expect(host.getFilePreview).toHaveBeenCalledWith({
      repoId: "allocated-session",
      path: "shared.txt",
    });
  },
};

export const CachedScopeChanges: Story = {
  play: async ({ canvasElement }) => {
    const { composer, textarea, root, setRepo, type } = await fixture(canvasElement);
    let host = repo();
    await setRepo(host);
    for (const change of ["repoId", "repoHost", "disabled"] as const) {
      await type("/diff ");
      await waitFor(() => expect(root.querySelector(".arg-list")).not.toBeNull());
      await type("Review @shared");
      await waitFor(() => expect(root.querySelector(".preview-code")).not.toBeNull());
      if (change === "repoId") composer.repoId = "another-session";
      if (change === "repoHost") {
        host = repo("replacement host");
        await setRepo(host);
      }
      if (change === "disabled") composer.fileMentionsDisabled = true;
      await composer.updateComplete;
      await expect(root.querySelector(".mention-picker, .arg-list")).toBeNull();
      await expect(textarea.value).toBe("Review @shared");
      await expect(root.activeElement).toBe(textarea);
      if (change === "disabled") {
        composer.fileMentionsDisabled = false;
        await composer.updateComplete;
      }
      const treeCalls = host.listTree.mock.calls.length;
      const refCalls = host.listBranches.mock.calls.length;
      const previewCalls = host.getFilePreview.mock.calls.length;
      await type("/diff ");
      await waitFor(() => expect(host.listBranches).toHaveBeenCalledTimes(refCalls + 1));
      await type("Review @shared");
      await waitFor(() => expect(host.getFilePreview).toHaveBeenCalledTimes(previewCalls + 1));
      await expect(host.listTree).toHaveBeenCalledTimes(treeCalls + 1);
    }
  },
};

export const PendingCompletionScopeChanges: Story = {
  play: async ({ canvasElement }) => {
    const { composer, root, setRepo, type } = await fixture(canvasElement);
    for (const text of ["@", "/diff HEAD ", "/diff "]) {
      for (const fail of [false, true]) {
        const oldTree = deferred<Awaited<ReturnType<RepoHost["listTree"]>>>();
        const oldRefs = deferred<Awaited<ReturnType<RepoHost["listBranches"]>>>();
        const oldHost = {
          ...repo(),
          listTree: fn(() => oldTree.promise),
          listBranches: fn(() => oldRefs.promise),
        };
        await setRepo(oldHost);
        await type(text);
        await expect(
          text === "/diff " ? oldHost.listBranches : oldHost.listTree,
        ).toHaveBeenCalledTimes(1);
        composer.repoId += ":next";
        await composer.updateComplete;
        const currentHost = repo();
        await setRepo(currentHost);
        await type(text);
        await waitFor(() =>
          expect(root.querySelector(text === "@" ? ".mention-list" : ".arg-list")).not.toBeNull(),
        );
        if (fail) {
          if (text === "/diff ") oldRefs.reject(new Error("old scope failed"));
          else oldTree.reject(new Error("old scope failed"));
        } else {
          oldTree.resolve(tree("obsolete.txt"));
          oldRefs.resolve({
            branches: [{ name: "obsolete-ref", commit: "old", committerTime: 0n, subject: "old" }],
            tags: [],
          });
        }
        // Drain the old response and all chained completion continuations.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        await composer.updateComplete;
        await type(text);
        await expect(currentHost.listTree).toHaveBeenCalledTimes(text === "/diff " ? 0 : 1);
        await expect(currentHost.listBranches).toHaveBeenCalledTimes(text === "/diff " ? 1 : 0);
        await expect(root.textContent).not.toContain("obsolete.txt");
        await expect(root.textContent).not.toContain("obsolete-ref");
        if (text !== "/diff ") {
          await waitFor(() =>
            expect(
              root.querySelector(text === "@" ? ".mention-list" : ".arg-list")?.textContent,
            ).toContain("shared.txt"),
          );
        } else {
          // Keep the selected ref visible and inside its highlight surface.
          const list = root.querySelector(".arg-list")!.getBoundingClientRect();
          const item = root.querySelector(".arg-item.active")!.getBoundingClientRect();
          const label = root.querySelector(".arg-item.active .arg-label")!;
          await expect(label.textContent).toBe("HEAD");
          const bounds = label.getBoundingClientRect();
          await expect(bounds.width).toBeGreaterThan(0);
          await expect(bounds.left).toBeGreaterThanOrEqual(item.left);
          await expect(bounds.right).toBeLessThanOrEqual(item.right);
          await expect(item.left).toBeGreaterThanOrEqual(list.left);
          await expect(item.right).toBeLessThanOrEqual(list.right);
        }
      }
    }
  },
};

export const PendingPreviewScopeChanges: Story = {
  play: async ({ canvasElement }) => {
    const { composer, root, setRepo, type } = await fixture(canvasElement);
    for (const fail of [false, true]) {
      const oldPreview = deferred<FilePreview>();
      const oldHost = { ...repo(), getFilePreview: fn(() => oldPreview.promise) };
      await setRepo(oldHost);
      await type("@shared");
      await waitFor(() => expect(oldHost.getFilePreview).toHaveBeenCalledTimes(1));
      composer.fileMentionsDisabled = true;
      await composer.updateComplete;
      await expect(root.querySelector(".mention-picker")).toBeNull();
      if (fail) oldPreview.reject(new Error("obsolete preview error"));
      else oldPreview.resolve(preview("obsolete preview"));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await composer.updateComplete;
      await expect(root.querySelector(".mention-picker")).toBeNull();
      const currentHost = repo("allocated contents");
      await setRepo(currentHost);
      composer.repoId = "allocated-session";
      composer.fileMentionsDisabled = false;
      await composer.updateComplete;
      await type("@shared");
      await waitFor(() =>
        expect(root.querySelector(".preview-code")?.textContent).toContain("allocated contents"),
      );
      await expect(root.textContent).not.toContain("obsolete preview");
    }
  },
};
