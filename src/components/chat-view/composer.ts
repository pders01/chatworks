import { LitElement, html, css, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { customElement, property, state } from "lit/decorators.js";
import { consume } from "@lit/context";
import {
  EntryType,
  llmConfigHostContext,
  repoHostContext,
  type FilePreview,
  type LlmConfigHost,
  type RepoHost,
} from "../../host.js";
import { type ClientAttachment, fmtBytes, messageOf } from "../../lib/chat-types.js";
import {
  ALLOWED_ATTACHMENT_MIMES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  readFileToAttachment,
} from "../../lib/attachments.js";
import {
  SLASH_COMMANDS,
  transformSlashCommands,
  parseSlashAction,
  matchActionArgContext,
  splitArgPartial,
  type SlashCommand,
  type ActionArgContext,
} from "../../lib/slash.js";
import { buildAvailabilityContext, formatSources, isProviderAvailable } from "../../lib/catalog.js";

// Rendered form of an action-arg suggestion. Shape mirrors ComboboxOption
// but is local to the composer so slash.ts stays pure — lib/ has no DOM
// imports and should stay framework-agnostic.
interface ArgSuggestion {
  value: string;
  label: string;
  description?: string;
}

@customElement("cw-composer")
export class GcComposer extends LitElement {
  @consume({ context: repoHostContext, subscribe: true })
  private repoHost?: RepoHost;
  @consume({ context: llmConfigHostContext, subscribe: true })
  private llmConfigHost!: LlmConfigHost;

  @property({ type: String }) repoId = "";
  @property({ type: Boolean }) sending = false;
  @property({ type: String }) errorMsg = "";
  // Consumer-overridable placeholder. Empty string falls back to the
  // canonical default so existing call sites that don't set this keep
  // their current copy; non-repo consumers (chat-standalone, future
  // shells) can pass a product-appropriate prompt.
  @property({ type: String }) placeholder = "";
  @property({ type: Boolean, reflect: true }) compact = false;
  /** Commands shown and interpreted by slash completion. */
  @property({ attribute: false }) slashCommands: readonly SlashCommand[] = SLASH_COMMANDS;

  @state() private input = "";
  @state() private pendingAttachments: ClientAttachment[] = [];
  @state() private dragActive = false;
  private dragDepth = 0;
  @state() private mentionResults: string[] = [];
  @state() private showMentions = false;
  @state() private mentionIdx = -1;
  @state() private mentionPreview: FilePreview | null = null;
  @state() private mentionPreviewHtml = "";
  @state() private mentionPreviewLoading = false;
  @state() private mentionPreviewError = "";
  private dirCache = new Map<string, string[]>();
  private checkMentionSeq = 0;
  private mentionPreviewSeq = 0;

  @state() private slashResults: SlashCommand[] = [];
  @state() private showSlash = false;
  @state() private slashIdx = 0;
  @state() private commandHelpQuery = "";

  // Arg-completion mode: engaged after the user types a space following
  // an action command (e.g. `/model `). Suggestions come from RPC calls
  // made lazily and cached for the lifetime of this composer instance.
  @state() private argCtx: ActionArgContext | null = null;
  @state() private argResults: ArgSuggestion[] = [];
  @state() private showArgs = false;
  @state() private argIdx = 0;
  private argFetchSeq = 0;
  private modelSuggestionCache: ArgSuggestion[] | null = null;
  private profileSuggestionCache: ArgSuggestion[] | null = null;
  private refSuggestionCache: ArgSuggestion[] | null = null;

  /** Public: set input text (used by parent for prefill / insert). */
  setInput(value: string) {
    this.input = value;
  }

  /** Public: focus the textarea. */
  focusInput() {
    const ta = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
    ta?.focus();
  }

  /** Public: insert a file mention at the current cursor position. */
  insertFileMention(path: string) {
    const ta = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = this.input.slice(0, pos);
    const after = this.input.slice(pos);
    const atIdx = before.lastIndexOf("@");
    if (atIdx >= 0 && !before.slice(atIdx).includes(" ")) {
      this.input = before.slice(0, atIdx) + "@" + path + " " + after;
      requestAnimationFrame(() => {
        ta.focus();
        const newPos = atIdx + path.length + 2;
        ta.setSelectionRange(newPos, newPos);
      });
    } else {
      this.input = before + " @" + path + " " + after;
      requestAnimationFrame(() => {
        ta.focus();
        const newPos = pos + path.length + 3;
        ta.setSelectionRange(newPos, newPos);
      });
    }
  }

  /** Public: reset after send. */
  clearAfterSend() {
    this.input = "";
    this.pendingAttachments = [];
    const ta = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
    if (ta) ta.style.height = "auto";
  }

  private fire<T>(name: string, detail: T) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  private onInput(e: Event) {
    const ta = e.target as HTMLTextAreaElement;
    this.input = ta.value;
    this.autoResize(ta);
    void this.checkMention();
    this.checkSlash();
    void this.checkArgContext();
    this.emitInputChanged();
  }

  /** Emit the composed payload size so the chat-view can render a live
   * token/cost estimate in the active-model indicator. Kept to
   * primitives — text is not sent over the event, only its byte size
   * and the running attachment total, so listeners can't accidentally
   * leak the draft into other surfaces. */
  private emitInputChanged() {
    const attachmentBytes = this.pendingAttachments.reduce((n, a) => n + a.size, 0);
    this.fire("gc:input-changed", {
      textLength: this.input.length,
      attachmentBytes,
    });
  }

  private async checkArgContext() {
    const ta = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = this.input.slice(0, pos);
    const lineStart = before.lastIndexOf("\n") + 1;
    const currentLine = before.slice(lineStart);
    const ctx = matchActionArgContext(currentLine, this.slashCommands);
    if (!ctx || !ctx.command.argCompletion) {
      this.argCtx = null;
      this.argResults = [];
      this.showArgs = false;
      return;
    }
    // showSlash and showArgs are mutually exclusive — once we're in
    // arg mode, the command-selection menu shouldn't be showing.
    this.showSlash = false;
    this.argCtx = ctx;
    const { priorArgs, currentToken } = splitArgPartial(ctx.command.argCompletion, ctx.partial);
    const seq = ++this.argFetchSeq;
    const all = await this.loadArgSuggestions(
      ctx.command.command ?? ctx.command.trigger,
      priorArgs,
      currentToken,
    );
    if (seq !== this.argFetchSeq) return;
    const q = currentToken.toLowerCase();
    this.argResults = q
      ? all.filter((s) => s.label.toLowerCase().includes(q) || s.value.toLowerCase().includes(q))
      : all.slice(0, 20);
    this.argIdx = 0;
    this.showArgs = this.argResults.length > 0;
  }

  private async loadArgSuggestions(
    trigger: string,
    priorArgs: string[],
    currentToken: string,
  ): Promise<ArgSuggestion[]> {
    if (trigger === "profile") {
      if (this.profileSuggestionCache) return this.profileSuggestionCache;
      try {
        const resp = await this.llmConfigHost.listProfiles({});
        const list = (resp.profiles ?? []).map((p) => ({
          value: p.name,
          label: p.name,
          description: `${p.backend} · ${p.model || "backend default"}`,
        }));
        this.profileSuggestionCache = list;
        return list;
      } catch {
        return [];
      }
    }
    if (trigger === "model") {
      if (this.modelSuggestionCache) return this.modelSuggestionCache;
      try {
        // Fetch catalog + local endpoints + profiles + current config
        // in parallel so we can filter the catalog to *callable*
        // providers. Without this filter, /model would surface Claude
        // and GPT-4o even when the user has no Anthropic/OpenAI key —
        // picking one just leaves the config in a broken state or,
        // worse, sends a key meant for another provider.
        const [catResp, localResp, profilesResp, configResp] = await Promise.all([
          this.llmConfigHost.getProviderCatalog({}).catch(() => null),
          this.llmConfigHost.discoverLocalEndpoints({}).catch(() => null),
          this.llmConfigHost.listProfiles({}).catch(() => null),
          this.llmConfigHost.getConfig({}).catch(() => null),
        ]);
        const ctx = buildAvailabilityContext(
          localResp?.endpoints ?? [],
          profilesResp?.profiles ?? [],
          configResp?.entries ?? [],
        );
        const seen = new Set<string>();
        const out: ArgSuggestion[] = [];
        for (const ep of localResp?.endpoints ?? []) {
          for (const id of ep.models ?? []) {
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({ value: id, label: id, description: `${ep.name} (local)` });
          }
        }
        for (const prov of catResp?.providers ?? []) {
          if (!isProviderAvailable(prov, ctx)) continue;
          for (const m of prov.models ?? []) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            const sourceTag = formatSources(m.sources);
            out.push({
              value: m.id,
              label: m.name || m.id,
              description: sourceTag ? `${prov.name} · ${sourceTag}` : prov.name,
            });
          }
        }
        this.modelSuggestionCache = out;
        return out;
      } catch {
        return [];
      }
    }
    if (trigger === "diff") {
      // Arg 1 (first token): refs — branches, tags, plus common
      // HEAD~N shortcuts so users can start a range without knowing
      // branch names. Ranges (`A..B`) get treated as refs too — the
      // transformer splits them later.
      // Arg 2 (trailing): paths under the partial's dirname.
      if (priorArgs.length === 0) {
        return this.loadDiffRefs();
      }
      return this.loadPathSuggestions(currentToken);
    }
    return [];
  }

  private async loadDiffRefs(): Promise<ArgSuggestion[]> {
    if (this.refSuggestionCache) return this.refSuggestionCache;
    const shortcuts: ArgSuggestion[] = [
      { value: "HEAD", label: "HEAD", description: "latest commit" },
      { value: "HEAD~1", label: "HEAD~1", description: "one commit back" },
      { value: "HEAD~3", label: "HEAD~3", description: "three commits back" },
      { value: "HEAD~5", label: "HEAD~5", description: "five commits back" },
      { value: "HEAD~10", label: "HEAD~10", description: "ten commits back" },
    ];
    if (!this.repoHost) {
      this.refSuggestionCache = shortcuts;
      return shortcuts;
    }
    try {
      const resp = await this.repoHost.listBranches({ repoId: this.repoId });
      const branches: ArgSuggestion[] = (resp.branches ?? []).map((b) => ({
        value: b.name,
        label: b.name,
        description: b.subject || "branch",
      }));
      const tags: ArgSuggestion[] = (resp.tags ?? []).map((t) => ({
        value: t.name,
        label: t.name,
        description: "tag",
      }));
      this.refSuggestionCache = [...shortcuts, ...branches, ...tags];
      return this.refSuggestionCache;
    } catch {
      return shortcuts;
    }
  }

  // Reuse the @-mention dirCache for listTree calls. Partial may be
  // "web/", "web/src/f", or "" — we resolve the dirname and filter
  // by the leaf prefix. The filter that runs in checkArgContext then
  // further narrows against the FULL partial, which is fine because
  // entry paths include the dirname prefix.
  private async loadPathSuggestions(partial: string): Promise<ArgSuggestion[]> {
    const lastSlash = partial.lastIndexOf("/");
    const dirPath = lastSlash >= 0 ? partial.slice(0, lastSlash) : "";
    if (!this.repoHost) return [];
    if (!this.dirCache.has(dirPath)) {
      try {
        const resp = await this.repoHost.listTree({ repoId: this.repoId, path: dirPath });
        const prefix = dirPath ? dirPath + "/" : "";
        this.dirCache.set(
          dirPath,
          resp.entries.map((e) => prefix + e.name + (e.type === EntryType.DIR ? "/" : "")),
        );
      } catch {
        this.dirCache.set(dirPath, []);
      }
    }
    return (this.dirCache.get(dirPath) ?? []).map((p) => ({
      value: p,
      label: p,
      description: p.endsWith("/") ? "directory" : "file",
    }));
  }

  // Scroll the active item in a listbox into view after keyboard nav.
  // Takes the selector so one helper covers mention, slash, and arg lists.
  private scrollActiveIntoView(listSelector: string) {
    void this.updateComplete.then(() => {
      const el = this.renderRoot.querySelector<HTMLElement>(
        `${listSelector} [aria-selected="true"]`,
      );
      el?.scrollIntoView({ block: "nearest" });
    });
  }

  private acceptArgSuggestion(sugg: ArgSuggestion) {
    const ta = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
    if (!ta || !this.argCtx) return;
    const cmd = this.argCtx.command;
    const mode = cmd.argCompletion ?? "whole";
    const pos = ta.selectionStart;
    const before = this.input.slice(0, pos);
    const after = this.input.slice(pos);
    const lineStart = before.lastIndexOf("\n") + 1;
    const currentLine = before.slice(lineStart);

    let newLine: string;
    let newCaretInLine: number;
    if (mode === "whole") {
      // Replace everything after `/cmd ` (single arg, may contain spaces).
      newLine = `/${cmd.trigger} ` + sugg.value;
      newCaretInLine = newLine.length;
    } else {
      // "word" mode — replace just the current token (last whitespace-delimited
      // fragment), preserving anything typed before it. For directory suggestions
      // (trailing "/") we DON'T add a space so the user can keep drilling; for
      // final values (refs, files, model IDs) append a space so the cursor is
      // parked where the next arg would start.
      const lastSpace = currentLine.lastIndexOf(" ");
      const head = currentLine.slice(0, lastSpace + 1);
      const trailing = sugg.value.endsWith("/") ? "" : " ";
      newLine = head + sugg.value + trailing;
      newCaretInLine = newLine.length;
    }

    this.input = before.slice(0, lineStart) + newLine + after;
    this.showArgs = false;
    this.argResults = [];
    this.argCtx = null;
    requestAnimationFrame(() => {
      ta.focus();
      const newPos = lineStart + newCaretInLine;
      ta.setSelectionRange(newPos, newPos);
      // For directory drilldowns we re-open the arg menu so the user
      // can keep typing; for final selections (files, refs, models),
      // the caller decides whether to submit.
      if (sugg.value.endsWith("/")) void this.checkArgContext();
    });
  }

  private checkSlash() {
    const ta = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = this.input.slice(0, pos);
    const lineStart = before.lastIndexOf("\n") + 1;
    const currentLine = before.slice(lineStart);
    // Only trigger on a slash token at the very start of a line (no
    // whitespace before). Once the user types a space, the command is "armed"
    // and the menu stays hidden until the line is edited back.
    const m = currentLine.match(/^\/([^\s/]*)$/);
    if (!m) {
      this.showSlash = false;
      this.slashResults = [];
      return;
    }
    const q = m[1].toLowerCase();
    this.slashResults = this.slashCommands.filter((c) => c.trigger.toLowerCase().startsWith(q));
    this.slashIdx = 0;
    this.showSlash = this.slashResults.length > 0;
  }

  private openCommandHelp() {
    this.commandHelpQuery = "";
    this.showSlash = false;
    void this.updateComplete.then(() => {
      const dialog = this.renderRoot.querySelector<HTMLDialogElement>(".command-help");
      if (!dialog?.open) dialog?.showModal();
      requestAnimationFrame(() =>
        dialog?.querySelector<HTMLInputElement>(".command-help-search")?.focus(),
      );
    });
  }

  private closeCommandHelp() {
    this.renderRoot.querySelector<HTMLDialogElement>(".command-help")?.close();
  }

  private restoreComposerFocus() {
    requestAnimationFrame(() => this.focusInput());
  }

  private chooseHelpCommand(command: SlashCommand) {
    this.input = `/${command.trigger} `;
    this.closeCommandHelp();
    requestAnimationFrame(() => {
      const textarea = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
      textarea?.focus();
      textarea?.setSelectionRange(this.input.length, this.input.length);
      if (command.kind === "action") void this.checkArgContext();
    });
  }

  private commandHelpGroups(): Array<[string, SlashCommand[]]> {
    const query = this.commandHelpQuery.trim().toLowerCase();
    const groups = new Map<string, SlashCommand[]>();
    for (const command of this.slashCommands) {
      if (
        query &&
        !`${command.trigger} ${command.hint} ${command.category ?? ""}`
          .toLowerCase()
          .includes(query)
      ) {
        continue;
      }
      const category = command.category || "commands";
      const entries = groups.get(category) ?? [];
      entries.push(command);
      groups.set(category, entries);
    }
    return [...groups];
  }

  private acceptSlash(cmd: SlashCommand) {
    const ta = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = this.input.slice(0, pos);
    const after = this.input.slice(pos);
    const lineStart = before.lastIndexOf("\n") + 1;
    const replacement = `/${cmd.trigger} `;
    this.input = before.slice(0, lineStart) + replacement + after;
    this.showSlash = false;
    requestAnimationFrame(() => {
      ta.focus();
      const newPos = lineStart + replacement.length;
      ta.setSelectionRange(newPos, newPos);
      // Programmatic input skips the input event, so arg-completion
      // wouldn't otherwise engage until the user types a character.
      // Kick it manually for action commands (transform commands like
      // /diff don't currently have arg completion).
      if (cmd.kind === "action") void this.checkArgContext();
    });
  }

  private autoResize(ta: HTMLTextAreaElement) {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.4) + "px";
  }

  private async checkMention() {
    const seq = ++this.checkMentionSeq;
    const ta = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = this.input.slice(0, pos);
    const atMatch = before.match(/@([\w\-./]*)$/);
    if (!atMatch) {
      this.showMentions = false;
      this.mentionResults = [];
      this.clearMentionPreview();
      return;
    }
    const query = atMatch[1];
    const lastSlash = query.lastIndexOf("/");
    const dirPath = lastSlash >= 0 ? query.slice(0, lastSlash) : "";
    const filterPart = (lastSlash >= 0 ? query.slice(lastSlash + 1) : query).toLowerCase();
    if (!this.repoHost) {
      this.mentionResults = [];
      this.showMentions = false;
      this.clearMentionPreview();
      return;
    }
    if (!this.dirCache.has(dirPath)) {
      this.mentionResults = [];
      this.showMentions = false;
      this.clearMentionPreview();
      try {
        const resp = await this.repoHost.listTree({ repoId: this.repoId, path: dirPath });
        const prefix = dirPath ? dirPath + "/" : "";
        this.dirCache.set(
          dirPath,
          resp.entries.map((e) => prefix + e.name + (e.type === EntryType.DIR ? "/" : "")),
        );
      } catch {
        this.dirCache.set(dirPath, []);
      }
      if (seq !== this.checkMentionSeq) return;
    }
    this.mentionResults = (this.dirCache.get(dirPath) || [])
      .filter((p) => {
        const name = p.slice(p.lastIndexOf("/", p.length - 2) + 1).toLowerCase();
        return name.includes(filterPart);
      })
      .slice(0, 8);
    this.mentionIdx = this.mentionResults.length > 0 ? 0 : -1;
    this.showMentions = this.mentionResults.length > 0;
    if (this.mentionIdx >= 0) void this.loadMentionPreview(this.mentionResults[this.mentionIdx]);
    else this.clearMentionPreview();
  }

  private selectMention(index: number): void {
    this.mentionIdx = index;
    const path = this.mentionResults[index];
    if (path) void this.loadMentionPreview(path);
  }

  private async loadMentionPreview(path: string): Promise<void> {
    const readPreview = this.repoHost?.getFilePreview;
    if (!readPreview || path.endsWith("/")) {
      this.clearMentionPreview();
      return;
    }
    if (this.mentionPreview?.path === path) return;
    const seq = ++this.mentionPreviewSeq;
    this.mentionPreview = null;
    this.mentionPreviewHtml = "";
    this.mentionPreviewError = "";
    this.mentionPreviewLoading = true;
    try {
      const preview = await readPreview.call(this.repoHost, { repoId: this.repoId, path });
      if (seq === this.mentionPreviewSeq) {
        this.mentionPreview = preview;
        if (!preview.binary) void this.highlightMentionPreview(preview, seq);
      }
    } catch (error) {
      if (seq === this.mentionPreviewSeq) this.mentionPreviewError = messageOf(error);
    } finally {
      if (seq === this.mentionPreviewSeq) this.mentionPreviewLoading = false;
    }
  }

  private async highlightMentionPreview(preview: FilePreview, seq: number): Promise<void> {
    try {
      const { highlight } = await import("../../lib/highlight.js");
      const rendered = await highlight(preview.content, previewLanguage(preview.language));
      if (seq === this.mentionPreviewSeq) this.mentionPreviewHtml = rendered;
    } catch {
      // The escaped plain-text preview remains available if highlighting fails.
    }
  }

  private clearMentionPreview(): void {
    this.mentionPreviewSeq++;
    this.mentionPreview = null;
    this.mentionPreviewHtml = "";
    this.mentionPreviewLoading = false;
    this.mentionPreviewError = "";
  }

  private insertMention(path: string) {
    const ta = this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = this.input.slice(0, pos);
    const after = this.input.slice(pos);
    const atIdx = before.lastIndexOf("@");
    const isDirectory = path.endsWith("/");
    const suffix = isDirectory ? "" : " ";
    this.input = before.slice(0, atIdx) + "@" + path + suffix + after;
    if (isDirectory) {
      requestAnimationFrame(() => {
        ta.focus();
        const newPos = atIdx + path.length + 1;
        ta.setSelectionRange(newPos, newPos);
        void this.checkMention();
      });
      return;
    }
    this.showMentions = false;
    this.clearMentionPreview();
    requestAnimationFrame(() => {
      ta.focus();
      const newPos = atIdx + path.length + 2;
      ta.setSelectionRange(newPos, newPos);
    });
  }

  private onKeydown(e: KeyboardEvent) {
    if (this.showMentions && this.mentionResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.selectMention((this.mentionIdx + 1) % this.mentionResults.length);
        this.scrollActiveIntoView(".mention-list");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.selectMention(
          this.mentionIdx <= 0 ? this.mentionResults.length - 1 : this.mentionIdx - 1,
        );
        this.scrollActiveIntoView(".mention-list");
        return;
      }
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        this.selectMention(e.key === "Home" ? 0 : this.mentionResults.length - 1);
        this.scrollActiveIntoView(".mention-list");
        return;
      }
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        const preview = this.renderRoot.querySelector<HTMLElement>(".preview-code");
        preview?.scrollBy({
          top: (e.key === "PageDown" ? 1 : -1) * Math.max(120, preview.clientHeight * 0.8),
        });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const idx = this.mentionIdx >= 0 ? this.mentionIdx : 0;
        this.insertMention(this.mentionResults[idx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.showMentions = false;
        this.clearMentionPreview();
        return;
      }
    }
    if (this.showSlash && this.slashResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.slashIdx = (this.slashIdx + 1) % this.slashResults.length;
        this.scrollActiveIntoView(".slash-list");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.slashIdx = this.slashIdx <= 0 ? this.slashResults.length - 1 : this.slashIdx - 1;
        this.scrollActiveIntoView(".slash-list");
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        this.acceptSlash(this.slashResults[this.slashIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.showSlash = false;
        return;
      }
    }
    if (this.showArgs && this.argResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.argIdx = (this.argIdx + 1) % this.argResults.length;
        this.scrollActiveIntoView(".arg-list");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.argIdx = this.argIdx <= 0 ? this.argResults.length - 1 : this.argIdx - 1;
        this.scrollActiveIntoView(".arg-list");
        return;
      }
      if (e.key === "Tab") {
        // Tab inserts the suggestion in place, composer stays open so
        // the user can tweak (e.g. append more args).
        e.preventDefault();
        this.acceptArgSuggestion(this.argResults[this.argIdx]);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const sugg = this.argResults[this.argIdx];
        const cmd = this.argCtx?.command;
        const isDir = sugg.value.endsWith("/");
        // Auto-submit rule: action commands (single-shot side effect)
        // submit immediately on Enter. Transform commands like /diff
        // might still want more args (path after ref), so accept and
        // keep editing. Directory suggestions never submit.
        const autoSubmit = cmd?.kind === "action" && !isDir;
        this.acceptArgSuggestion(sugg);
        if (autoSubmit) queueMicrotask(() => this.submit());
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.showArgs = false;
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.submit();
    }
  }

  private submit() {
    if (this.sending) return;
    // Action commands short-circuit the LLM send and fire an event
    // for the parent to handle (switch model, activate profile, etc.).
    // /help is handled locally via a toast rather than eventing up.
    const action = parseSlashAction(this.input, this.slashCommands);
    if (action) {
      this.input = "";
      if (action.command === "help") {
        this.openCommandHelp();
      } else {
        this.fire("gc:slash-action", { command: action.command, args: action.args });
      }
      return;
    }
    const text = transformSlashCommands(this.input, this.slashCommands).trim();
    const attachments = this.pendingAttachments;
    if (!text && attachments.length === 0) return;
    this.fire("gc:send", { text, attachments });
  }

  private async addFiles(files: FileList | File[] | null | undefined) {
    if (!files || files.length === 0) return;
    const existing = this.pendingAttachments;
    const additions: ClientAttachment[] = [];
    const rejections: string[] = [];
    let runningTotal = existing.reduce((n, a) => n + a.size, 0);
    for (const f of Array.from(files)) {
      if (existing.length + additions.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        rejections.push(`max ${MAX_ATTACHMENTS_PER_MESSAGE} attachments reached`);
        break;
      }
      if (!ALLOWED_ATTACHMENT_MIMES.has(f.type)) {
        rejections.push(`${f.name}: unsupported type ${f.type || "unknown"}`);
        continue;
      }
      if (f.size > MAX_ATTACHMENT_BYTES) {
        rejections.push(
          `${f.name}: too large (${fmtBytes(f.size)} > ${fmtBytes(MAX_ATTACHMENT_BYTES)})`,
        );
        continue;
      }
      if (runningTotal + f.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
        rejections.push(`${f.name}: would exceed total size cap`);
        continue;
      }
      try {
        const att = await readFileToAttachment(f);
        additions.push(att);
        runningTotal += att.size;
      } catch (e) {
        rejections.push(`${f.name}: ${messageOf(e)}`);
      }
    }
    if (additions.length > 0) {
      this.pendingAttachments = [...existing, ...additions];
      this.fire("gc:announce", {
        message: `${additions.length} attachment${additions.length === 1 ? "" : "s"} added`,
      });
      this.emitInputChanged();
    }
    if (rejections.length > 0) {
      this.fire("gc:error", { message: rejections.join("; ") });
    }
  }

  private removeAttachment(index: number) {
    const next = this.pendingAttachments.slice();
    next.splice(index, 1);
    this.pendingAttachments = next;
    this.emitInputChanged();
  }

  private async onPickFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    await this.addFiles(input.files);
    input.value = "";
  }

  private async onPasteAttach(e: ClipboardEvent) {
    const items = e.clipboardData?.files;
    if (items && items.length > 0) {
      e.preventDefault();
      await this.addFiles(items);
    }
  }

  private onDragEnter(e: DragEvent) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    this.dragDepth++;
    this.dragActive = true;
  }

  private onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
  }

  private onDragLeave(e: DragEvent) {
    e.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragActive = false;
  }

  private async onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragDepth = 0;
    this.dragActive = false;
    await this.addFiles(e.dataTransfer?.files);
  }

  private stop() {
    this.fire("gc:stop", {});
  }

  private renderMentionPreview() {
    if (!this.repoHost?.getFilePreview) return nothing;
    const selected = this.mentionResults[this.mentionIdx] || "";
    let body;
    if (selected.endsWith("/")) {
      body = html`<div class="preview-state" part="preview-state">
        Open the directory to browse its files.
      </div>`;
    } else if (this.mentionPreviewLoading) {
      body = html`<div class="preview-state" part="preview-state">Loading preview…</div>`;
    } else if (this.mentionPreviewError) {
      body = html`<div class="preview-state preview-error" part="preview-state preview-error">
        ${this.mentionPreviewError}
      </div>`;
    } else if (this.mentionPreview?.binary) {
      body = html`<div class="preview-state" part="preview-state">
        Binary file · preview unavailable
      </div>`;
    } else if (this.mentionPreview) {
      body = html`<div
        class="preview-code"
        part="preview-code"
        tabindex="0"
        aria-label="File contents"
      >
        ${this.mentionPreviewHtml
          ? unsafeHTML(this.mentionPreviewHtml)
          : html`<pre><code>${this.mentionPreview.content}</code></pre>`}
      </div>`;
    } else {
      body = html`<div class="preview-state" part="preview-state">Choose a file to preview.</div>`;
    }
    return html`<aside class="mention-preview" part="mention-preview" aria-live="polite">
      <header>
        <span title=${selected}>${selected || "preview"}</span>
        ${this.mentionPreview
          ? html`<small
              >${fmtBytes(Number(this.mentionPreview.size))}${this.mentionPreview.truncated
                ? " · truncated"
                : ""}</small
            >`
          : nothing}
      </header>
      ${body}
    </aside>`;
  }

  private renderCommandHelp() {
    const groups = this.commandHelpGroups();
    return html`<dialog
      class="command-help"
      part="command-help"
      aria-labelledby="command-help-title"
      @close=${this.restoreComposerFocus}
      @cancel=${(event: Event) => {
        event.preventDefault();
        this.closeCommandHelp();
      }}
      @keydown=${(event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        this.closeCommandHelp();
      }}
      @click=${(event: MouseEvent) => {
        if (event.target === event.currentTarget) this.closeCommandHelp();
      }}
    >
      <div class="command-help-shell" part="command-help-shell">
        <header class="command-help-header" part="command-help-header">
          <div>
            <span class="command-help-kicker" part="command-help-kicker">composer reference</span>
            <h2 id="command-help-title">Commands</h2>
            <p>Choose a command to place it in the composer.</p>
          </div>
          <button
            type="button"
            class="command-help-close"
            part="command-help-close"
            aria-label="Close command help"
            @click=${this.closeCommandHelp}
          >
            ×
          </button>
        </header>
        <div class="command-help-toolbar" part="command-help-toolbar">
          <label>
            <span aria-hidden="true">⌕</span>
            <input
              class="command-help-search"
              part="command-help-search"
              type="search"
              placeholder="Filter commands"
              aria-label="Filter commands"
              .value=${this.commandHelpQuery}
              @input=${(event: Event) =>
                (this.commandHelpQuery = (event.target as HTMLInputElement).value)}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                this.closeCommandHelp();
              }}
            />
          </label>
          <span
            >${groups.reduce((count, [, commands]) => count + commands.length, 0)} available</span
          >
        </div>
        <div class="command-help-body" part="command-help-body">
          ${groups.length
            ? groups.map(
                ([category, commands]) => html`<section
                  class="command-help-group"
                  part="command-help-group"
                >
                  <header>
                    <h3>${commandCategoryLabel(category)}</h3>
                    <span>${commands.length}</span>
                  </header>
                  <div class="command-help-grid" part="command-help-grid">
                    ${commands.map((command) => {
                      const description = splitCommandDescription(command.hint);
                      const label = splitCommandLabel(command.label);
                      return html`<button
                        type="button"
                        class="command-help-item"
                        part="command-help-item"
                        title=${command.example}
                        @click=${() => this.chooseHelpCommand(command)}
                      >
                        <code title=${command.label}
                          >${label.namespace
                            ? html`<span class="command-namespace" part="command-namespace"
                                >${label.namespace}</span
                              >`
                            : nothing}<span class="command-entity" part="command-entity"
                            >${label.entity}</span
                          ></code
                        >
                        <span class="command-help-copy" part="command-help-copy">
                          <span>${description.summary}</span>
                          ${description.triggers
                            ? html`<small><b>Triggers</b> ${description.triggers}</small>`
                            : nothing}
                        </span>
                      </button>`;
                    })}
                  </div>
                </section>`,
              )
            : html`<div class="command-help-empty" part="command-help-empty">
                No commands match that filter.
              </div>`}
        </div>
        <footer part="command-help-footer">
          <kbd part="command-help-key">esc</kbd> close <span>·</span> select a command to insert it
        </footer>
      </div>
    </dialog>`;
  }

  override render() {
    return html`
      <form
        class="composer ${this.dragActive ? "drag-active" : ""} ${this.showMentions
          ? "mention-open"
          : ""}"
        part="composer ${this.dragActive ? "drag-active" : ""} ${this.showMentions
          ? "mention-open"
          : ""}"
        role="search"
        aria-label="Chat composer"
        @submit=${(e: Event) => {
          e.preventDefault();
          this.submit();
        }}
        @dragenter=${this.onDragEnter}
        @dragover=${this.onDragOver}
        @dragleave=${this.onDragLeave}
        @drop=${this.onDrop}
      >
        <div class="composer-inner" part="composer-inner">
          <slot name="controls"></slot>
          ${this.pendingAttachments.length > 0
            ? html`<div class="attachment-strip" part="attachment-strip" role="list">
                ${this.pendingAttachments.map((a, i) => this.renderAttachmentChip(a, i))}
              </div>`
            : nothing}
          <textarea
            part="input"
            .value=${this.input}
            @input=${this.onInput}
            @keydown=${this.onKeydown}
            @paste=${this.onPasteAttach}
            placeholder=${this.placeholder ||
            "ask about the repo — use @path/to/file to pin content"}
            ?disabled=${this.sending}
            rows="1"
            aria-label="Message input — type @ for file autocomplete or / for slash commands, Enter to send, drop files to attach"
            aria-describedby="composer-status"
            aria-autocomplete="list"
            aria-controls=${this.showMentions
              ? "mention-list"
              : this.showSlash
                ? "slash-list"
                : this.showArgs
                  ? "arg-list"
                  : nothing}
            aria-activedescendant=${this.showMentions && this.mentionIdx >= 0
              ? `mention-option-${this.mentionIdx}`
              : this.showSlash
                ? `slash-option-${this.slashIdx}`
                : this.showArgs
                  ? `arg-option-${this.argIdx}`
                  : nothing}
          ></textarea>
          ${this.showMentions
            ? html`<div
                class="mention-picker ${this.repoHost?.getFilePreview ? "with-preview" : ""}"
                part="mention-picker ${this.repoHost?.getFilePreview ? "with-preview" : ""}"
              >
                <ul
                  id="mention-list"
                  class="mention-list"
                  part="mention-list"
                  role="listbox"
                  aria-label="Workspace files"
                  tabindex="0"
                  @keydown=${this.onKeydown}
                >
                  ${this.mentionResults.map(
                    (p, i) => html`<li
                      id=${`mention-option-${i}`}
                      role="option"
                      class="mention-item ${i === this.mentionIdx ? "active" : ""}"
                      part="mention-item ${i === this.mentionIdx ? "active" : ""}"
                      aria-selected=${i === this.mentionIdx ? "true" : "false"}
                      @pointerenter=${() => this.selectMention(i)}
                      @click=${() => this.insertMention(p)}
                    >
                      ${p}
                    </li>`,
                  )}
                </ul>
                ${this.renderMentionPreview()}
              </div>`
            : nothing}
          ${this.showSlash
            ? html`<ul
                id="slash-list"
                class="slash-list"
                part="slash-list"
                role="listbox"
                aria-label="Slash commands"
                tabindex="0"
                @keydown=${this.onKeydown}
              >
                ${this.slashResults.map(
                  (c, i) => html`<li
                    id=${`slash-option-${i}`}
                    role="option"
                    class="slash-item ${i === this.slashIdx ? "active" : ""}"
                    part="slash-item ${i === this.slashIdx ? "active" : ""}"
                    aria-selected=${i === this.slashIdx ? "true" : "false"}
                    @click=${() => this.acceptSlash(c)}
                    title=${`${c.label} — ${c.hint}\n${c.example}`}
                  >
                    <span class="slash-label" part="slash-label">${c.label}</span>
                    <span class="slash-hint" part="slash-hint">${c.hint}</span>
                    <span
                      class="slash-example ${c.category ? "slash-category" : ""}"
                      part="slash-example ${c.category ? "slash-category" : ""}"
                      >${c.category || c.example}</span
                    >
                  </li>`,
                )}
              </ul>`
            : nothing}
          ${this.showArgs && this.argCtx
            ? html`<ul
                id="arg-list"
                class="slash-list arg-list"
                part="slash-list arg-list"
                role="listbox"
                aria-label="${this.argCtx.command.label} arguments"
                tabindex="0"
                @keydown=${this.onKeydown}
              >
                ${this.argResults.map(
                  (s, i) => html`<li
                    id=${`arg-option-${i}`}
                    role="option"
                    class="slash-item arg-item ${i === this.argIdx ? "active" : ""}"
                    part="slash-item arg-item ${i === this.argIdx ? "active" : ""}"
                    aria-selected=${i === this.argIdx ? "true" : "false"}
                    @click=${() => {
                      // Mirror the keyboard-Enter rule: directories drill,
                      // transform commands keep editing, only final action
                      // picks auto-submit. Otherwise clicking a directory
                      // during /diff completion would ship a half-formed
                      // marker.
                      const cmd = this.argCtx?.command;
                      const isDir = s.value.endsWith("/");
                      const autoSubmit = cmd?.kind === "action" && !isDir;
                      this.acceptArgSuggestion(s);
                      if (autoSubmit) queueMicrotask(() => this.submit());
                    }}
                  >
                    <span class="arg-label" part="arg-label">${s.label}</span>
                    ${s.description
                      ? html`<span class="slash-hint" part="slash-hint">${s.description}</span>`
                      : nothing}
                  </li>`,
                )}
              </ul>`
            : nothing}
          <div class="composer-row" part="composer-row">
            <span class="composer-hint" part="composer-hint" id="composer-status" role="status">
              ${this.errorMsg
                ? html`<span class="err" part="err">⚠ ${this.errorMsg}</span>`
                : this.sending
                  ? html`<span class="dim" part="dim">streaming…</span>`
                  : html`<span class="dim" part="dim"
                      >↵ send · shift+↵ newline · drag or paste to attach</span
                    >`}
            </span>
            <input
              type="file"
              class="attach-input"
              part="attach-input"
              multiple
              accept=${[...ALLOWED_ATTACHMENT_MIMES].join(",")}
              @change=${(e: Event) => void this.onPickFiles(e)}
              aria-hidden="true"
              tabindex="-1"
            />
            <button
              type="button"
              class="attach-btn"
              part="attach-btn"
              aria-label="Attach file"
              title="Attach file"
              ?disabled=${this.sending ||
              this.pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
              @click=${() => {
                const el = this.renderRoot.querySelector<HTMLInputElement>(".attach-input");
                el?.click();
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M10.5 6.5 6 11a2.5 2.5 0 0 1-3.54-3.54L7.5 2.5a1.75 1.75 0 0 1 2.47 2.47L5.5 9.44"
                />
              </svg>
            </button>
            ${this.sending
              ? html`<button
                  type="button"
                  class="stop"
                  part="stop"
                  aria-label="Stop generating"
                  @click=${() => this.stop()}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="2" y="2" width="10" height="10" rx="1.5" />
                  </svg>
                  stop
                </button>`
              : html`<button
                  type="submit"
                  aria-label="Send message"
                  class="send"
                  part="send"
                  ?disabled=${!this.input.trim() && this.pendingAttachments.length === 0}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M8 12V4M4 7l4-4 4 4" />
                  </svg>
                </button>`}
          </div>
        </div>
      </form>
      ${this.renderCommandHelp()}
    `;
  }

  private renderAttachmentChip(a: ClientAttachment, index: number) {
    const isImage = a.mimeType.startsWith("image/") && a.url;
    const tooltip = `${a.filename} · ${fmtBytes(a.size)}`;
    const remove = html`<button
      type="button"
      class="attachment-remove"
      part="attachment-remove"
      aria-label="Remove ${a.filename}"
      title="Remove"
      @click=${() => this.removeAttachment(index)}
    >
      ×
    </button>`;
    if (isImage) {
      return html`<div
        class="attachment-chip is-image"
        part="attachment-chip is-image"
        role="listitem"
        title=${tooltip}
      >
        <img src=${a.url!} alt=${a.filename} class="attachment-thumb" part="attachment-thumb" />
        ${remove}
      </div>`;
    }
    return html`<div
      class="attachment-chip is-file"
      part="attachment-chip is-file"
      role="listitem"
      title=${tooltip}
    >
      <span class="attachment-glyph" part="attachment-glyph" aria-hidden="true">📄</span>
      <span class="attachment-meta" part="attachment-meta">
        <span class="attachment-name" part="attachment-name">${a.filename}</span>
        <span class="attachment-size" part="attachment-size">${fmtBytes(a.size)}</span>
      </span>
      ${remove}
    </div>`;
  }

  static override styles = css`
    :host {
      display: block;
      container-type: inline-size;
    }
    .composer {
      flex-shrink: 0;
      padding: var(--space-3, 0.75rem) var(--space-7, 2rem) var(--space-5, 1.25rem);
      position: relative;
    }
    .composer::before {
      content: none;
    }
    :host([compact]) .composer {
      padding: var(--space-2, 0.5rem) var(--space-4, 1rem) var(--space-3, 0.75rem);
    }
    :host([compact]) .composer::before {
      top: -12px;
      height: 12px;
    }
    .composer-inner {
      position: relative;
      max-width: var(--content-max-width, 52rem);
      margin: 0 auto;
      box-sizing: border-box;
      padding: 0.65rem 0.85rem var(--space-2, 0.5rem);
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    :host([unfocused]) .composer-inner {
      max-width: 1000px;
    }
    :host([compact]) .composer-inner {
      width: min(
        calc(100% - var(--composer-gutter, 0px)),
        calc(var(--content-max-width, 52rem) - var(--composer-gutter, 0px))
      );
      max-width: none;
      margin-inline: auto;
      padding: 0.42rem 0.65rem var(--space-1, 0.25rem);
      gap: var(--space-1, 0.25rem);
      transform: translateX(calc(var(--composer-gutter, 0px) / 2));
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      resize: none;
      padding: 0.15rem 0.05rem;
      min-height: 1.5em;
      max-height: 40vh;
      overflow-y: auto;
      field-sizing: content;
    }
    /* Slash completion remains a compact popover. File mentions expand the
       composer in-flow so the picker can use enough space without clipping. */
    .slash-list {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      z-index: 10;
      max-height: min(38vh, 330px);
      overflow-y: auto;
      scrollbar-gutter: stable;
      margin: 0 0 var(--space-1, 0.25rem);
      padding: var(--space-1, 0.25rem) 0;
      list-style: none;
    }
    .slash-list:focus-visible,
    .mention-list:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -2px;
    }
    :host([compact]) .composer.mention-open .composer-inner {
      width: min(calc(100vw - (var(--space-7, 2rem) * 2)), 74rem);
      transform: none;
    }
    .mention-picker {
      display: grid;
      min-height: 18rem;
      overflow: hidden;
    }
    .mention-picker.with-preview {
      height: clamp(16rem, 34vh, 22rem);
      grid-template-columns: minmax(13rem, 2fr) minmax(0, 5fr);
    }
    .mention-list {
      min-width: 0;
      overflow-y: auto;
      margin: 0;
      padding: var(--space-1, 0.25rem) 0;
      list-style: none;
    }
    .mention-preview {
      display: flex;
      min-width: 0;
      min-height: 0;
      flex-direction: column;
    }
    .mention-preview header {
      display: flex;
      align-items: center;
      min-height: 32px;
      gap: var(--space-2, 0.5rem);
      padding: 0 var(--space-3, 0.75rem);
    }
    .mention-preview header span {
      min-width: 0;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mention-preview header small {
      flex: none;
    }
    .preview-code {
      min-height: 0;
      flex: 1;
      overflow: auto;
      tab-size: 2;
    }
    .preview-code:focus-visible {
      outline-offset: -2px;
    }
    .preview-code pre,
    .preview-code .shiki {
      min-width: max-content;
      min-height: 100%;
      margin: 0;
      padding: var(--space-3, 0.75rem) 0;
    }
    .preview-code code {
      counter-reset: preview-line;
    }
    .preview-code .line {
      display: inline-block;
      width: 100%;
      padding-right: var(--space-3, 0.75rem);
      counter-increment: preview-line;
    }
    .preview-code .line::before {
      content: counter(preview-line);
      display: inline-block;
      width: 4ch;
      margin-right: var(--space-3, 0.75rem);
      padding-left: var(--space-2, 0.5rem);
      text-align: right;
      user-select: none;
    }
    .preview-code > pre:not(.shiki) {
      padding: var(--space-3, 0.75rem);
      white-space: pre;
    }
    .preview-state {
      display: grid;
      min-height: 150px;
      flex: 1;
      place-items: center;
      padding: var(--space-3, 0.75rem);
      text-align: center;
    }
    .mention-item {
      display: block;
      width: 100%;
      padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
      text-align: left;
      cursor: pointer;
    }
    .slash-item {
      display: grid;
      grid-template-columns: minmax(9rem, 15rem) minmax(0, 1fr) max-content;
      align-items: center;
      column-gap: var(--space-3, 0.75rem);
      width: 100%;
      min-height: 30px;
      padding: var(--space-1, 0.25rem) var(--space-3, 0.75rem);
      text-align: left;
      cursor: pointer;
    }
    .slash-label,
    .slash-hint,
    .slash-example {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .slash-example {
      max-width: min(22vw, 18rem);
    }
    .slash-category {
      padding: 0.08rem 0.35rem;
    }
    .arg-item {
      grid-template-columns: max-content 1fr;
    }
    .command-help {
      width: min(92rem, calc(100vw - 2.5rem));
      height: min(54rem, calc(100vh - 2.5rem));
      max-width: none;
      max-height: none;
      margin: auto;
      padding: 0;
      overflow: hidden;
    }
    .command-help-shell {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      height: 100%;
    }
    .command-help-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4, 1rem);
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem) var(--space-4, 1rem);
    }
    .command-help-header h2 {
      margin: var(--space-1, 0.25rem) 0 0;
    }
    .command-help-header p {
      margin: var(--space-1, 0.25rem) 0 0;
    }
    .command-help-close {
      width: 30px;
      height: 30px;
      flex: none;
      padding: 0;
      cursor: pointer;
    }
    .command-help-toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-4, 1rem);
      padding: var(--space-3, 0.75rem) var(--space-6, 1.5rem);
    }
    .command-help-toolbar label {
      display: flex;
      min-width: 0;
      flex: 1;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: 0 var(--space-3, 0.75rem);
    }
    .command-help-search {
      width: 100%;
      padding: 0.55rem 0;
    }
    .command-help-toolbar > span {
      flex: none;
    }
    .command-help-body {
      min-height: 0;
      overflow-y: auto;
      scrollbar-gutter: stable;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem) var(--space-6, 1.5rem);
    }
    .command-help-group + .command-help-group {
      margin-top: var(--space-6, 1.5rem);
    }
    .command-help-group > header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      margin-bottom: var(--space-2, 0.5rem);
    }
    .command-help-group h3 {
      margin: 0;
    }
    .command-help-group > header span {
      display: inline-grid;
      min-width: 1.2rem;
      height: 1.2rem;
      place-items: center;
    }
    .command-help-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2, 0.5rem);
    }
    .command-help-item {
      display: grid;
      grid-template-columns: minmax(13rem, 18rem) minmax(0, 1fr);
      align-items: start;
      gap: var(--space-4, 1rem);
      min-width: 0;
      padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
      text-align: left;
      cursor: pointer;
    }
    .command-help-item code {
      min-width: 0;
      overflow-wrap: anywhere;
      white-space: normal;
    }
    .command-help-copy {
      display: grid;
      min-width: 0;
      gap: var(--space-1, 0.25rem);
    }
    .command-help-copy small {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
    .command-help-copy b {
      margin-right: 0.35rem;
    }
    .command-help-empty {
      display: grid;
      min-height: 12rem;
      place-items: center;
    }
    .command-help-shell > footer {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-2, 0.5rem) var(--space-6, 1.5rem);
    }
    .command-help-shell > footer kbd {
      padding: 0.08rem 0.3rem;
    }
    .attach-input {
      display: none;
    }
    .attach-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      cursor: pointer;
      flex-shrink: 0;
      margin-left: auto;
    }
    .attach-btn[disabled] {
      cursor: not-allowed;
    }
    .attachment-strip {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 0.5rem);
    }
    .attachment-chip {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .attachment-chip.is-image {
      padding: 0;
      overflow: hidden;
      width: 56px;
      height: 56px;
    }
    .attachment-chip.is-file {
      gap: 0.4rem;
      padding: 5px 6px 5px 8px;
      max-width: 240px;
    }
    .attachment-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .attachment-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .attachment-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .attachment-remove {
      cursor: pointer;
      padding: 0;
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .attachment-chip.is-image .attachment-remove {
      position: absolute;
      top: 3px;
      right: 3px;
    }
    .attachment-chip.is-file .attachment-remove {
      margin-left: 0.2rem;
      width: 16px;
      height: 16px;
    }
    .composer-row {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }
    .send {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      cursor: pointer;
      flex-shrink: 0;
    }
    .send:disabled {
      cursor: not-allowed;
    }
    .stop {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.7rem;
      cursor: pointer;
      flex-shrink: 0;
    }
    textarea::-webkit-scrollbar {
      width: 8px;
    }
    :focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
    button:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -1px;
    }
    @container (max-width: 560px) {
      :host([compact]) .composer.mention-open .composer-inner {
        width: 100%;
      }
      .mention-picker.with-preview {
        height: min(56vh, 32rem);
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, auto) minmax(0, 1fr);
      }
      .mention-list {
        max-height: 10rem;
      }
      .mention-preview {
        min-height: 0;
      }
      .preview-state {
        min-height: 8rem;
      }
    }
    @media (max-width: 1050px) {
      .command-help-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @media (max-width: 700px) {
      .slash-item {
        grid-template-columns: minmax(8rem, 42%) minmax(0, 1fr);
      }
      .slash-example {
        display: none;
      }
      .command-help {
        width: calc(100vw - 1rem);
        height: calc(100vh - 1rem);
      }
      .command-help-header,
      .command-help-toolbar,
      .command-help-body {
        padding-right: var(--space-4, 1rem);
        padding-left: var(--space-4, 1rem);
      }
      .command-help-item {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-2, 0.5rem);
      }
    }
    @media (max-width: 560px) {
      :host([compact]) .composer.mention-open .composer-inner {
        width: calc(100vw - (var(--space-3, 0.75rem) * 2));
      }
      .mention-picker.with-preview {
        height: min(52vh, 28rem);
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, auto) minmax(0, 1fr);
      }
      .mention-list {
        max-height: 9rem;
      }
      .mention-preview {
        min-height: 0;
      }
      .preview-state {
        min-height: 8rem;
      }
    }
  `;
}

function previewLanguage(extension?: string): string {
  const aliases: Record<string, string> = {
    js: "javascript",
    md: "markdown",
    py: "python",
    rb: "ruby",
    sh: "shellscript",
    ts: "typescript",
    yml: "yaml",
  };
  return aliases[extension || ""] || extension || "plaintext";
}

function commandCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    web: "Web UI",
    extension: "Extensions",
    prompt: "Prompt templates",
    skill: "Skills",
    commands: "Commands",
  };
  return (
    labels[category] ||
    category.replace(
      /(^|[-_])(\w)/g,
      (_, space, letter) => `${space ? " " : ""}${String(letter).toUpperCase()}`,
    )
  );
}

function splitCommandLabel(label: string): { namespace: string; entity: string } {
  const match = label.match(/^(\/[^:]+:)(.+)$/);
  return match ? { namespace: match[1], entity: match[2] } : { namespace: "", entity: label };
}

function splitCommandDescription(description: string): { summary: string; triggers: string } {
  const marker = description.search(/\s+Triggers:\s*/i);
  if (marker < 0) return { summary: description, triggers: "" };
  const matched = description.slice(marker).match(/^\s+Triggers:\s*/i)?.[0] ?? "";
  return {
    summary: description.slice(0, marker).trim(),
    triggers: description.slice(marker + matched.length).trim(),
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "cw-composer": GcComposer;
  }
  // Event payloads are declared centrally in web/src/lib/events.ts so
  // every consumer sees the same contract.
}
