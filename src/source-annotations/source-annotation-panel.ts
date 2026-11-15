import {
  LitElement,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { live } from "lit/directives/live.js";
import { customElement, property, state } from "lit/decorators.js";
import type {
  AnnotationClient,
  AnnotationCategory,
  AnnotationState,
  AnnotationWhitespace,
  ResolvedAnnotation,
  SourceAnnotation,
} from "@jpahd/source-annotations/contracts";
import { panelStyles } from "./styles.js";

const categories: AnnotationCategory[] = ["explanation", "invariant", "review", "question"];
type CategoryFilter = AnnotationCategory | "all";

// The owner may temporarily unmount a hidden pane while changing views. Keep
// drafts outside the element instance, but key them by the complete scope so a
// draft can never appear under another client, host scope, file, or snapshot.
const annotationDraftCache = new Map<string, AnnotationDraft>();
const annotationEditDraftCache = new Map<string, AnnotationEditDraft>();
const annotationEditingCache = new Map<string, string>();
const annotationSelectionCache = new Map<string, { anchor: number; focus: number }>();
const clientScopeIds = new WeakMap<object, number>();
let nextClientScopeId = 1;
const SOURCE_PAGE_SIZE = 500;

export interface SourceAnnotationsChangedDetail {
  scopeKey: string;
  path: string;
  ref: string;
}

/** Opaque, scope-bound presentation state for an owning file tab. */
export interface AnnotationSourcePosition {
  scope: string;
  page: number;
  panelTop: number;
  sourceTop: number;
  sourceLeft: number;
  composerOpen: boolean;
}

interface AnnotationDraft {
  body: string;
  category: AnnotationCategory;
  whitespace: AnnotationWhitespace;
  startLine: string;
  endLine: string;
}

interface AnnotationEditDraft {
  body: string;
  category: AnnotationCategory;
}

/** A deliberately small, scope-fenced reader and lifecycle editor for source notes. */
@customElement("source-annotation-panel")
export class SourceAnnotationPanel extends LitElement {
  /** Stable identity for one backend/authority. Never recreate a client on render. */
  @property({ attribute: false }) client?: AnnotationClient;
  /** Required opaque host scope (workspace/account/session). No ambient fallback. */
  @property({ type: String, attribute: "scope-key" }) scopeKey = "";
  @property({ type: String }) path = "";
  /** Suppress the duplicate heading when a containing reader already names the file. */
  @property({ type: Boolean, attribute: "hide-path" }) hidePath = false;
  /** The symbolic ref selected by the owner, when the snapshot was resolved. */
  @property({ type: String }) requestedRef = "";
  /** The resolved immutable snapshot, or WORKTREE for an ephemeral projection. */
  @property({ type: String }) ref = "HEAD";
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean }) readOnly = false;
  @property({ type: Boolean }) allowCreate = false;
  @property({ type: Number }) maxLine?: number;
  /** Complete immutable preview text, when the owner has one. */
  @property({ type: String }) content = "";
  /** Render the source and its notes together instead of the legacy notes pane. */
  @property({ type: Boolean }) sourceView = false;
  /** TRUSTED ONLY: escaped highlighter HTML per line. Never pass arbitrary host/user HTML. */
  @property({ attribute: false }) highlightedLines: string[] = [];
  @property({ type: Boolean }) showAnnotations = true;

  @state() private items: ResolvedAnnotation[] = [];
  @state() private resolvedRef = "";
  @state() private loading = false;
  @state() private error = "";
  @state() private warning = "";
  @state() private filter: CategoryFilter = "all";
  @state() private editingId = "";
  @state() private editBody = "";
  private editingScope = "";
  @state() private editCategory: AnnotationCategory = "explanation";
  @state() private busyId = "";
  @state() private selectedStart = 0;
  @state() private selectedEnd = 0;
  @state() private composerOpen = false;
  @state() private sourcePage = 0;

  private readonly drafts = annotationDraftCache;
  private readonly editDrafts = annotationEditDraftCache;
  private scopeGeneration = 0;
  private listSequence = 0;
  private mutationSequence = 0;
  private loadingScope = "";
  private busyScope = "";
  private busyOperation = 0;
  private connected = false;
  private hasRendered = false;
  private renderedScope = "";
  private focusLine = 0;
  private focusComposer = false;
  private sourceScrollPosition = { panelTop: 0, sourceTop: 0, sourceLeft: 0 };

  override connectedCallback(): void {
    super.connectedCallback();
    this.connected = true;
    document.addEventListener("selectionchange", this.inferTextSelection);
    if (this.hasRendered && this.active) void this.load();
  }

  override disconnectedCallback(): void {
    this.connected = false;
    document.removeEventListener("selectionchange", this.inferTextSelection);
    this.fenceScope();
    // Do not let a completion from a disconnected instance mutate it later.
    this.busyId = "";
    this.busyScope = "";
    super.disconnectedCallback();
  }

  override willUpdate(changed: PropertyValues): void {
    const scopeChanged =
      changed.has("scopeKey") ||
      changed.has("path") ||
      changed.has("ref") ||
      changed.has("requestedRef") ||
      changed.has("client");
    if (scopeChanged) {
      this.fenceScope();
      this.items = [];
      this.resolvedRef = "";
      this.error = "";
      this.warning = "";
      this.loading = false;
      const nextScope = this.currentScope();
      this.editingId = annotationEditingCache.get(nextScope) ?? "";
      this.editingScope = this.editingId ? nextScope : "";
      this.busyId = "";
      this.busyScope = "";
      const selection = annotationSelectionCache.get(this.currentScope());
      this.selectedStart = selection?.anchor ?? 0;
      this.selectedEnd = selection?.focus ?? 0;
      this.composerOpen = false;
      this.sourcePage = 0;
      this.sourceScrollPosition = { panelTop: 0, sourceTop: 0, sourceLeft: 0 };
    }
    this.renderedScope = this.currentScope();
  }

  override updated(changed: PropertyValues): void {
    this.hasRendered = true;
    const scopeChanged =
      changed.has("scopeKey") ||
      changed.has("path") ||
      changed.has("ref") ||
      changed.has("requestedRef") ||
      changed.has("client");
    if (this.focusComposer && this.composerOpen) {
      this.focusComposer = false;
      this.renderRoot.querySelector<HTMLTextAreaElement>("[data-source-composer]")?.focus();
    }
    if (this.focusLine > 0) {
      const line = this.focusLine;
      this.focusLine = 0;
      this.renderRoot.querySelector<HTMLButtonElement>(`.gutter[data-line="${line}"]`)?.focus();
    }
    if (
      this.connected &&
      this.active &&
      (scopeChanged || changed.has("active") || changed.has("showAnnotations"))
    ) {
      void this.load();
    }
    if (changed.has("active") && !this.active) this.fenceScope();
  }

  private rememberSourceScroll = (): void => {
    // The shell hides a routed view before its active-property update runs.
    // Cache user scrolling while visible; display:none geometry is not a new
    // reading position and must never overwrite the last observed offsets.
    if (!this.sourceView || !this.getClientRects().length) return;
    const panel = this.renderRoot.querySelector<HTMLElement>(".panel");
    const source = this.renderRoot.querySelector<HTMLElement>(".source-scroll");
    this.sourceScrollPosition = {
      panelTop: panel?.scrollTop ?? 0,
      sourceTop: source?.scrollTop ?? 0,
      sourceLeft: source?.scrollLeft ?? 0,
    };
  };

  captureSourcePosition(): AnnotationSourcePosition {
    this.rememberSourceScroll();
    return {
      scope: this.currentScope(),
      page: this.sourcePage,
      ...this.sourceScrollPosition,
      composerOpen: this.composerOpen,
    };
  }

  async restoreSourcePosition(position: AnnotationSourcePosition): Promise<void> {
    // Initial scope setup runs in updated(); wait before restoring the page.
    await this.updateComplete;
    if (!this.connected || !this.active || position.scope !== this.currentScope()) return;
    const generation = this.scopeGeneration;
    const lastPage = Math.max(0, Math.ceil(this.sourceLines().length / SOURCE_PAGE_SIZE) - 1);
    this.sourcePage = Math.min(lastPage, Math.max(0, Math.trunc(position.page) || 0));
    this.composerOpen =
      position.composerOpen &&
      Boolean(this.sourceSelection()) &&
      this.allowCreate &&
      !this.readOnly &&
      this.ref !== "WORKTREE";
    await this.updateComplete;
    if (
      !this.connected ||
      !this.active ||
      generation !== this.scopeGeneration ||
      position.scope !== this.currentScope()
    )
      return;
    const panel = this.renderRoot.querySelector<HTMLElement>(".panel");
    const source = this.renderRoot.querySelector<HTMLElement>(".source-scroll");
    if (panel) panel.scrollTop = position.panelTop;
    if (source) {
      source.scrollTop = position.sourceTop;
      source.scrollLeft = position.sourceLeft;
    }
    this.rememberSourceScroll();
  }

  private currentScope(): string {
    return JSON.stringify([
      clientScopeId(this.client),
      this.scopeKey,
      this.path,
      this.ref,
      this.requestedRef,
    ]);
  }

  private fenceScope(): void {
    this.scopeGeneration += 1;
    ++this.listSequence;
    ++this.mutationSequence;
    this.loadingScope = "";
  }

  private current(generation: number, scope: string): boolean {
    return (
      this.connected &&
      this.active &&
      generation === this.scopeGeneration &&
      scope === this.currentScope()
    );
  }

  /** DOM listeners retain the authority that rendered them until Lit updates. */
  private renderedAction<E extends Event>(
    action: (event: E, client: AnnotationClient | undefined) => unknown,
    writable = false,
  ): (event: E) => void {
    const client = this.client;
    const scope = this.currentScope();
    const generation = this.scopeGeneration;
    return (event) => {
      // Prevent native form navigation even when rejecting a stale submission.
      if (event.type === "submit") event.preventDefault();
      if (
        client !== this.client ||
        !this.current(generation, scope) ||
        (writable && (!client || this.readOnly || Boolean(this.busyId)))
      )
        return;
      action.call(this, event, client);
    };
  }

  private async load(): Promise<void> {
    if (
      !this.client ||
      !this.scopeKey ||
      !this.path ||
      !this.ref ||
      !this.active ||
      (this.sourceView && !this.showAnnotations)
    )
      return;
    const scope = this.currentScope();
    if (this.loadingScope === scope) return;
    const requestedRef = this.ref;
    const generation = this.scopeGeneration;
    const listSequence = ++this.listSequence;
    const mutationSequence = this.mutationSequence;
    this.loadingScope = scope;
    this.loading = true;
    this.error = "";
    try {
      const result = await this.client.list({
        ref: this.ref,
        path: this.path,
        includeResolved: true,
      });
      if (
        !this.current(generation, scope) ||
        listSequence !== this.listSequence ||
        mutationSequence !== this.mutationSequence
      )
        return;
      if (completeSha(requestedRef) && result.ref !== requestedRef) {
        throw new Error(
          "Annotation snapshot mismatch: the response does not match the requested immutable ref.",
        );
      }
      this.resolvedRef = result.ref;
      this.items = result.items;
    } catch (error) {
      if (
        this.current(generation, scope) &&
        listSequence === this.listSequence &&
        mutationSequence === this.mutationSequence
      )
        this.error = messageOf(error);
    } finally {
      if (this.current(generation, scope) && listSequence === this.listSequence) {
        this.loading = false;
        this.loadingScope = "";
      }
    }
  }

  private draft(): AnnotationDraft {
    return (
      this.drafts.get(this.currentScope()) ?? {
        body: "",
        category: "explanation",
        whitespace: "exact",
        startLine: "1",
        endLine: "1",
      }
    );
  }

  private setDraft(patch: Partial<AnnotationDraft>): void {
    if (!this.client || !this.scopeKey || this.busyId) return;
    const next = { ...this.draft(), ...patch };
    this.drafts.set(this.currentScope(), next);
    this.requestUpdate();
  }

  private async create(event: SubmitEvent, client: AnnotationClient | undefined): Promise<void> {
    event.preventDefault();
    if (
      !client ||
      !this.scopeKey ||
      !this.active ||
      this.readOnly ||
      !this.allowCreate ||
      this.ref === "WORKTREE" ||
      this.busyId
    )
      return;
    const snapshotRef = this.resolvedRef || (completeSha(this.ref) ? this.ref : "");
    if (!completeSha(snapshotRef)) {
      this.error = "Annotations require a complete immutable file snapshot.";
      return;
    }
    const draft = this.draft();
    const startLine = Number(draft.startLine);
    const endLine = Number(draft.endLine);
    if (!draft.body.trim()) {
      this.error = "Write an explanation before saving.";
      return;
    }
    if (!validLine(startLine) || !validLine(endLine) || startLine > endLine) {
      this.error = "Enter a positive inclusive line range.";
      return;
    }
    if (this.maxLine !== undefined && endLine > this.maxLine) {
      this.error = `This preview has ${this.maxLine} lines; the range must stay within it.`;
      return;
    }
    const scope = this.currentScope();
    const generation = this.scopeGeneration;
    const mutationSequence = ++this.mutationSequence;
    this.busyId = "create";
    this.busyScope = scope;
    this.busyOperation = mutationSequence;
    this.error = "";
    try {
      const annotation = await client.create({
        ref: snapshotRef,
        path: this.path,
        startLine,
        endLine,
        body: draft.body,
        category: draft.category,
        whitespace: draft.whitespace,
      });
      if (!this.current(generation, scope) || mutationSequence !== this.mutationSequence) return;
      this.drafts.set(scope, { ...draft, body: "" });
      this.items = [
        ...this.items,
        { annotation, placement: unchangedPlacement(annotation, annotation.target.commit) },
      ];
      if (this.sourceView) {
        this.composerOpen = false;
        this.clearSourceSelection();
        this.focusLine = endLine;
      }
      this.notifyChanged();
    } catch (error) {
      if (this.current(generation, scope) && mutationSequence === this.mutationSequence)
        this.error = messageOf(error);
    } finally {
      this.clearBusy("create", scope, mutationSequence);
    }
  }

  private beginEdit(item: ResolvedAnnotation): void {
    if (!this.client || !this.scopeKey || this.readOnly) return;
    const scope = this.currentScope();
    const key = this.editKey(scope, item.annotation.id);
    const draft = this.editDrafts.get(key) ?? {
      body: item.annotation.body,
      category: item.annotation.category,
    };
    this.editDrafts.set(key, draft);
    this.editingScope = scope;
    this.editingId = item.annotation.id;
    annotationEditingCache.set(scope, item.annotation.id);
    this.editBody = draft.body;
    this.editCategory = draft.category;
    this.error = "";
  }

  private async saveEdit(
    item: ResolvedAnnotation,
    client: AnnotationClient | undefined,
  ): Promise<void> {
    if (!client || !this.scopeKey || !this.active || this.readOnly || this.busyId) return;
    const scope = this.currentScope();
    const edit = this.editDrafts.get(this.editKey(scope, item.annotation.id)) ?? {
      body: this.editBody,
      category: this.editCategory,
    };
    if (!edit.body.trim()) return;
    const generation = this.scopeGeneration;
    const mutationSequence = ++this.mutationSequence;
    this.busyId = item.annotation.id;
    this.busyScope = scope;
    this.busyOperation = mutationSequence;
    try {
      const annotation = await client.update({
        id: item.annotation.id,
        expectedRevision: item.annotation.revision,
        body: edit.body,
        category: edit.category,
      });
      if (!this.current(generation, scope) || mutationSequence !== this.mutationSequence) return;
      this.items = this.items.map((candidate) =>
        candidate.annotation.id === annotation.id ? { ...candidate, annotation } : candidate,
      );
      this.editDrafts.delete(this.editKey(scope, item.annotation.id));
      annotationEditingCache.delete(scope);
      this.editingId = "";
      this.editingScope = "";
      this.notifyChanged();
    } catch (error) {
      if (this.current(generation, scope) && mutationSequence === this.mutationSequence)
        this.error = messageOf(error);
    } finally {
      this.clearBusy(item.annotation.id, scope, mutationSequence);
    }
  }

  private async toggleState(
    item: ResolvedAnnotation,
    client: AnnotationClient | undefined,
  ): Promise<void> {
    if (!client || !this.scopeKey || !this.active || this.readOnly || this.busyId) return;
    const scope = this.currentScope();
    const generation = this.scopeGeneration;
    const mutationSequence = ++this.mutationSequence;
    const state: AnnotationState = item.annotation.state === "resolved" ? "open" : "resolved";
    this.busyId = item.annotation.id;
    this.busyScope = scope;
    this.busyOperation = mutationSequence;
    try {
      const annotation = await client.update({
        id: item.annotation.id,
        expectedRevision: item.annotation.revision,
        state,
      });
      if (!this.current(generation, scope) || mutationSequence !== this.mutationSequence) return;
      this.items = this.items.map((candidate) =>
        candidate.annotation.id === annotation.id ? { ...candidate, annotation } : candidate,
      );
      this.notifyChanged();
    } catch (error) {
      if (this.current(generation, scope) && mutationSequence === this.mutationSequence)
        this.error = messageOf(error);
    } finally {
      this.clearBusy(item.annotation.id, scope, mutationSequence);
    }
  }

  private async deleteAnnotation(
    item: ResolvedAnnotation,
    client: AnnotationClient | undefined,
  ): Promise<void> {
    if (!client || !this.scopeKey || !this.active || this.readOnly || this.busyId) return;
    const scope = this.currentScope();
    const generation = this.scopeGeneration;
    const mutationSequence = ++this.mutationSequence;
    this.busyId = item.annotation.id;
    this.busyScope = scope;
    this.busyOperation = mutationSequence;
    try {
      await client.delete({ id: item.annotation.id, expectedRevision: item.annotation.revision });
      if (!this.current(generation, scope) || mutationSequence !== this.mutationSequence) return;
      this.items = this.items.filter((candidate) => candidate.annotation.id !== item.annotation.id);
      this.notifyChanged();
    } catch (error) {
      if (this.current(generation, scope) && mutationSequence === this.mutationSequence)
        this.error = messageOf(error);
    } finally {
      this.clearBusy(item.annotation.id, scope, mutationSequence);
    }
  }

  private clearBusy(id: string, scope: string, operation: number): void {
    if (
      this.connected &&
      this.busyId === id &&
      this.busyScope === scope &&
      this.busyOperation === operation
    ) {
      this.busyId = "";
      this.busyScope = "";
    }
  }

  private notifyChanged(): void {
    // A refresh started during this mutation may still contain the old revision.
    // Fence it on acceptance, including the mutation-before-list completion order.
    ++this.listSequence;
    this.loadingScope = "";
    this.loading = false;
    this.error = "";
    this.dispatchEvent(
      new CustomEvent<SourceAnnotationsChangedDetail>("source-annotations-changed", {
        bubbles: true,
        composed: true,
        detail: { scopeKey: this.scopeKey, path: this.path, ref: this.ref },
      }),
    );
  }

  private visibleItems(): ResolvedAnnotation[] {
    return this.items.filter(
      ({ annotation }) => this.filter === "all" || annotation.category === this.filter,
    );
  }

  private sourceLines(): string[] {
    return textLines(this.content);
  }

  private sourceSelection(): { start: number; end: number } | undefined {
    if (this.selectedStart < 1 || this.selectedEnd < 1) return undefined;
    return {
      start: Math.min(this.selectedStart, this.selectedEnd),
      end: Math.max(this.selectedStart, this.selectedEnd),
    };
  }

  private setSourceSelection(anchor: number, focus: number): void {
    if (this.busyId || (this.selectedStart === anchor && this.selectedEnd === focus)) return;
    this.selectedStart = anchor;
    this.selectedEnd = focus;
    annotationSelectionCache.set(this.currentScope(), { anchor, focus });
    if (this.composerOpen)
      this.setDraft({
        startLine: String(Math.min(anchor, focus)),
        endLine: String(Math.max(anchor, focus)),
      });
  }

  private clearSourceSelection(): void {
    if (this.textSelectionBounds()) window.getSelection()?.removeAllRanges();
    this.selectedStart = 0;
    this.selectedEnd = 0;
    annotationSelectionCache.delete(this.currentScope());
  }

  private sourceLineFromTarget(target: EventTarget | null): number | undefined {
    const element =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    const row = element?.closest<HTMLElement>(".source-row");
    const line = row?.dataset.line ? Number(row.dataset.line) : undefined;
    return line !== undefined && validLine(line) ? line : undefined;
  }

  private onGutterClick = (event: MouseEvent): void => {
    if (this.textSelectionBounds()) window.getSelection()?.removeAllRanges();
    const line = this.sourceLineFromTarget(event.currentTarget);
    if (!line) return;
    if (event.shiftKey && validLine(this.selectedStart)) {
      this.setSourceSelection(this.selectedStart, line);
    } else {
      this.setSourceSelection(line, line);
    }
  };

  private onGutterKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (this.composerOpen) this.cancelComposer();
      else this.clearSourceSelection();
      return;
    }
    if (!event.shiftKey || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    const line = this.sourceLineFromTarget(event.currentTarget);
    const lines = this.sourceLines();
    if (!line || lines.length === 0) return;
    const anchor = validLine(this.selectedStart) ? this.selectedStart : line;
    const focus = this.selectedEnd || line;
    const next = Math.max(1, Math.min(lines.length, focus + (event.key === "ArrowDown" ? 1 : -1)));
    event.preventDefault();
    this.setSourceSelection(anchor, next);
    this.sourcePage = Math.floor((next - 1) / SOURCE_PAGE_SIZE);
    this.focusLine = next;
  };

  private onSourceKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    const target = event.target instanceof HTMLElement ? event.target : undefined;
    if (event.key === "Escape" && this.composerOpen) {
      event.preventDefault();
      this.cancelComposer();
      return;
    }
    if (target?.classList.contains("gutter") || target?.matches("textarea, select, button")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (this.composerOpen) this.cancelComposer();
      else this.clearSourceSelection();
      return;
    }
    if (!event.shiftKey || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    const selection = this.sourceSelection();
    const lines = this.sourceLines();
    if (!selection || lines.length === 0) return;
    const next = Math.max(
      1,
      Math.min(lines.length, this.selectedEnd + (event.key === "ArrowDown" ? 1 : -1)),
    );
    event.preventDefault();
    this.setSourceSelection(this.selectedStart, next);
    this.sourcePage = Math.floor((next - 1) / SOURCE_PAGE_SIZE);
    this.focusLine = next;
  };

  private codeRowForNode(node: Node | null): HTMLElement | undefined {
    const element = node instanceof Element ? node : node?.parentElement;
    const row = element?.closest<HTMLElement>(".source-code")?.closest<HTMLElement>(".source-row");
    return row?.getRootNode() === this.renderRoot ? row : undefined;
  }

  private lineOfRow(row: HTMLElement | undefined): number | undefined {
    const value = row?.dataset.line ? Number(row.dataset.line) : undefined;
    return value !== undefined && validLine(value) ? value : undefined;
  }

  private endpointAtLineStart(node: Node, offset: number): boolean {
    if (offset < 0) return false;
    const row = this.codeRowForNode(node);
    const code = row?.querySelector<HTMLElement>(".source-code");
    if (!code) return false;
    const prefix = document.createRange();
    try {
      prefix.selectNodeContents(code);
      prefix.setEnd(node, offset);
      return prefix.toString().length === 0;
    } catch {
      return false;
    }
  }

  private sourceTextRange(): AbstractRange | undefined {
    const selection = window.getSelection();
    if (!selection) return undefined;
    // Native selections are retargeted at shadow boundaries by getRangeAt().
    // Composed ranges retain the actual source endpoints inside this component.
    const range =
      typeof selection.getComposedRanges === "function" && this.renderRoot instanceof ShadowRoot
        ? selection.getComposedRanges({ shadowRoots: [this.renderRoot] })[0]
        : selection.rangeCount
          ? selection.getRangeAt(0)
          : undefined;
    return range && !range.collapsed ? range : undefined;
  }

  private textSelectionBounds(): { start: number; end: number } | undefined {
    const range = this.sourceTextRange();
    if (!range) return undefined;
    const start = this.lineOfRow(this.codeRowForNode(range.startContainer));
    const end = this.lineOfRow(this.codeRowForNode(range.endContainer));
    if (!start || !end) return undefined;
    let last = end;
    if (last > start && this.endpointAtLineStart(range.endContainer, range.endOffset)) --last;
    if (last < start) return undefined;
    return { start, end: last };
  }

  private inferTextSelection = (): void => {
    if (
      !this.sourceView ||
      !this.active ||
      !this.connected ||
      this.renderedScope !== this.currentScope()
    )
      return;
    const bounds = this.textSelectionBounds();
    if (!bounds) return;
    this.setSourceSelection(bounds.start, bounds.end);
  };

  private onSourceCopy = (event: ClipboardEvent): void => {
    if (!event.clipboardData) return;
    const target = event.target instanceof HTMLElement ? event.target : undefined;
    if (target?.closest("textarea, input, [contenteditable]")) return;
    const range = this.sourceTextRange();
    const start = range && this.lineOfRow(this.codeRowForNode(range.startContainer));
    const end = range && this.lineOfRow(this.codeRowForNode(range.endContainer));
    if (range && start && end) {
      const offsetInCode = (node: Node, offset: number): number => {
        const prefix = document.createRange();
        prefix.selectNodeContents(this.codeRowForNode(node)!.querySelector(".source-code")!);
        prefix.setEnd(node, offset);
        return prefix.toString().length;
      };
      const firstOffset = offsetInCode(range.startContainer, range.startOffset);
      const lastOffset = offsetInCode(range.endContainer, range.endOffset);
      const lines = this.sourceLines().slice(start - 1, end);
      if (lines.length === 1) lines[0] = lines[0]!.slice(firstOffset, lastOffset);
      else {
        lines[0] = lines[0]!.slice(firstOffset);
        lines[lines.length - 1] = lines.at(-1)!.slice(0, lastOffset);
      }
      event.preventDefault();
      event.clipboardData.setData("text/plain", lines.join("\n"));
    } else if (target?.classList.contains("gutter")) {
      const bounds = this.sourceSelection();
      if (!bounds) return;
      event.preventDefault();
      event.clipboardData.setData(
        "text/plain",
        this.sourceLines()
          .slice(bounds.start - 1, bounds.end)
          .join("\n"),
      );
    }
  };

  private openComposer = (): void => {
    const selection = this.sourceSelection();
    if (!selection || !this.allowCreate || this.readOnly || this.ref === "WORKTREE") return;
    this.setDraft({ startLine: String(selection.start), endLine: String(selection.end) });
    this.error = "";
    this.composerOpen = true;
    this.sourcePage = Math.floor((selection.end - 1) / SOURCE_PAGE_SIZE);
    this.focusComposer = true;
  };

  private cancelComposer = (): void => {
    if (this.busyId) return;
    const selection = this.sourceSelection();
    this.composerOpen = false;
    this.focusLine = selection?.end ?? 0;
  };

  private goToSourcePage = (event: Event): void => {
    const page = Number((event.currentTarget as HTMLButtonElement).dataset.page);
    if (Number.isSafeInteger(page) && page >= 0) this.sourcePage = page;
  };

  private isCurrentPlacement(item: ResolvedAnnotation, lines: string[]): boolean {
    const placement = item.placement;
    return (
      (placement.status === "unchanged" || placement.status === "moved") &&
      placement.ref === (this.resolvedRef || this.ref) &&
      placement.path === this.path &&
      placement.startLine !== undefined &&
      placement.endLine !== undefined &&
      validLine(placement.startLine) &&
      validLine(placement.endLine) &&
      placement.startLine <= placement.endLine &&
      placement.endLine <= lines.length &&
      (this.maxLine === undefined || placement.endLine <= this.maxLine)
    );
  }

  private sourceItems(lines: string[]): {
    current: ResolvedAnnotation[];
    elsewhere: ResolvedAnnotation[];
  } {
    const current: ResolvedAnnotation[] = [];
    const elsewhere: ResolvedAnnotation[] = [];
    for (const item of this.visibleItems()) {
      (this.isCurrentPlacement(item, lines) ? current : elsewhere).push(item);
    }
    return { current, elsewhere };
  }

  private renderPageNav(
    page: number,
    pageCount: number,
    start: number,
    end: number,
  ): TemplateResult | typeof nothing {
    if (pageCount <= 1) return nothing;
    return html`<nav class="page-nav" aria-label="Source lines">
      <button ?disabled=${page === 0} data-page=${page - 1} @click=${this.goToSourcePage}>
        Previous
      </button>
      <span>Lines ${start}–${end} of ${this.sourceLines().length}</span>
      <button
        ?disabled=${page === pageCount - 1}
        data-page=${page + 1}
        @click=${this.goToSourcePage}
      >
        Next
      </button>
    </nav>`;
  }

  private renderSourceView(): TemplateResult {
    const lines = this.sourceLines();
    const { current, elsewhere } = this.sourceItems(lines);
    const pageCount = Math.max(1, Math.ceil(lines.length / SOURCE_PAGE_SIZE));
    const page = Math.min(this.sourcePage, pageCount - 1);
    const pageStart = lines.length === 0 ? 1 : page * SOURCE_PAGE_SIZE + 1;
    const pageEnd =
      lines.length === 0 ? 0 : Math.min(lines.length, pageStart + SOURCE_PAGE_SIZE - 1);
    const selection = this.sourceSelection();
    const notesByEnd = new Map<number, ResolvedAnnotation[]>();
    for (const item of current) {
      const end = item.placement.endLine!;
      const notes = notesByEnd.get(end) ?? [];
      notes.push(item);
      notesByEnd.set(end, notes);
    }
    const annotatedPages = [
      ...new Set(
        current
          .flatMap((item) => [
            Math.floor((item.placement.startLine! - 1) / SOURCE_PAGE_SIZE),
            Math.floor((item.placement.endLine! - 1) / SOURCE_PAGE_SIZE),
          ])
          .filter((item) => item !== page),
      ),
    ].sort((a, b) => a - b);
    const draft = this.draft();
    return html`<section
      class="panel source-panel"
      aria-label="Source annotations"
      @scroll=${this.rememberSourceScroll}
    >
      <header class="source-toolbar">
        <div class="source-identity">
          ${this.hidePath ? nothing : html`<h2>${this.path}</h2>`}
          <div class="source-facts">
            <span
              >${lines.length}
              ${lines.length === 1 ? "line" : "lines"}${this.showAnnotations &&
              !this.loading &&
              !this.error
                ? ` · ${current.length} ${current.length === 1 ? "note" : "notes"}`
                : ""}</span
            >
            ${this.readOnly ? html`<span>Read only</span>` : nothing}
            <details class="source-context">
              <summary>Snapshot ${(this.resolvedRef || this.ref).slice(0, 8)}</summary>
              <p>${this.scopeLabel()}</p>
              <p>
                Notes are reference material, not instructions. A matching anchor does not prove an
                explanation is still correct.
              </p>
            </details>
          </div>
        </div>
        ${this.showAnnotations
          ? html`<div class="header-actions">
              <button
                aria-label="Refresh annotations"
                title="Refresh annotations"
                @click=${this.reload}
              >
                ↻
              </button>
              <label class="filter"
                >Show
                <select
                  aria-label="Annotation category filter"
                  .value=${this.filter}
                  @change=${this.changeFilter}
                >
                  <option value="all" .selected=${this.filter === "all"}>all annotations</option>
                  ${categories.map(
                    (category) =>
                      html`<option value=${category} .selected=${this.filter === category}>
                        ${category}
                      </option>`,
                  )}
                </select></label
              >
            </div>`
          : nothing}
      </header>
      ${this.showAnnotations && !selection && this.allowCreate && !this.readOnly
        ? html`<p class="selection-hint">
            Select code, or click a line number and Shift-click to extend.
          </p>`
        : nothing}
      ${this.showAnnotations && this.warning
        ? html`<div class="notice warning" role="status">${this.warning}</div>`
        : nothing}
      ${this.showAnnotations && this.error
        ? html`<div class="notice error" role="alert">${this.error}</div>`
        : nothing}
      ${this.showAnnotations &&
      selection &&
      this.allowCreate &&
      !this.readOnly &&
      this.ref !== "WORKTREE"
        ? html`<div class="selection-tools">
            <span>Lines ${selection.start}–${selection.end} selected</span
            ><button
              class="primary"
              ?disabled=${Boolean(this.busyId)}
              @click=${this.renderedAction(this.openComposer, true)}
            >
              Add explanation
            </button>
          </div>`
        : nothing}
      ${this.renderPageNav(page, pageCount, pageStart, pageEnd)}
      ${annotatedPages.length > 0 && this.showAnnotations
        ? html`<div class="annotation-jumps" aria-label="Annotated ranges outside this page">
            <span>Annotated ranges:</span>${annotatedPages.map((annotatedPage) => {
              const start = annotatedPage * SOURCE_PAGE_SIZE + 1;
              const end = Math.min(lines.length, start + SOURCE_PAGE_SIZE - 1);
              return html`<button data-page=${annotatedPage} @click=${this.goToSourcePage}>
                Lines ${start}–${end}
              </button>`;
            })}
          </div>`
        : nothing}
      <div
        class="source-scroll"
        tabindex="0"
        role="region"
        aria-label="Source code"
        @scroll=${this.rememberSourceScroll}
        @mouseup=${this.renderedAction(this.inferTextSelection)}
        @keydown=${this.renderedAction(this.onSourceKeydown)}
        @copy=${this.renderedAction(this.onSourceCopy)}
      >
        <div class="source-document">
          ${lines.length === 0 ? html`<p class="empty-source">Empty file.</p>` : nothing}
          ${lines.slice(pageStart - 1, pageEnd).map((line, offset) => {
            const lineNumber = pageStart + offset;
            const selected =
              selection !== undefined &&
              lineNumber >= selection.start &&
              lineNumber <= selection.end;
            const highlighted = this.highlightedLines[lineNumber - 1];
            return html`<div
                class="source-row ${selected ? "selected" : ""}"
                data-line=${lineNumber}
              >
                <button
                  class="gutter"
                  data-line=${lineNumber}
                  ?disabled=${Boolean(this.busyId)}
                  aria-label=${`Select line ${lineNumber}`}
                  aria-pressed=${selected}
                  @click=${this.renderedAction(this.onGutterClick)}
                  @keydown=${this.renderedAction(this.onGutterKeydown)}
                >
                  ${lineNumber}
                </button>
                <code class="source-code"
                  >${highlighted === undefined ? line : unsafeHTML(highlighted)}</code
                >
              </div>
              ${this.showAnnotations
                ? notesByEnd.get(lineNumber)?.map((item) => this.renderVirtualAnnotation(item))
                : nothing}
              ${this.showAnnotations && this.composerOpen && selection?.end === lineNumber
                ? this.renderSourceCreate(draft)
                : nothing}`;
          })}
        </div>
      </div>
      ${this.renderPageNav(page, pageCount, pageStart, pageEnd)}
      ${this.showAnnotations && elsewhere.length > 0
        ? html`<details class="stale-notes">
            <summary>Notes not placed in this source (${elsewhere.length})</summary>
            <p>
              These notes are stale, unplaced, or belong to another path; they are not attached to
              the lines above.
            </p>
            <div class="items">${elsewhere.map((item) => this.renderItem(item))}</div>
          </details>`
        : nothing}
      ${this.showAnnotations &&
      !this.loading &&
      !this.error &&
      current.length === 0 &&
      elsewhere.length === 0
        ? html`<p class="state">
            ${this.filter === "all"
              ? "No notes yet. The source speaks for itself."
              : "No annotations in this category."}
          </p>`
        : nothing}
      ${this.showAnnotations && this.loading
        ? html`<p class="state" role="status">Loading annotations…</p>`
        : nothing}
    </section>`;
  }

  private renderVirtualAnnotation(item: ResolvedAnnotation): TemplateResult {
    const annotation = item.annotation;
    const scope = this.currentScope();
    const editing = this.editingScope === scope && this.editingId === annotation.id;
    const busy = this.busyId !== "";
    const edit = this.editDrafts.get(this.editKey(scope, annotation.id)) ?? {
      body: annotation.body,
      category: annotation.category,
    };
    return html`<article
      class="virtual-annotation ${annotation.state}"
      data-annotation-id=${annotation.id}
    >
      <div class="virtual-marker" aria-hidden="true">↳</div>
      <div class="virtual-content">
        <div class="item-head">
          <span class="category">${annotation.category}</span>${annotation.state === "resolved"
            ? html`<span class="state-label">resolved</span>`
            : nothing}<span
            class="placement-label"
            title=${`Current lines ${item.placement.startLine}–${item.placement.endLine}`}
            >After line
            ${item.placement.endLine}${item.placement.status === "moved" ? " · moved" : ""}</span
          >
        </div>
        ${editing
          ? html`<textarea
                aria-label="Edit annotation"
                ?disabled=${busy}
                .value=${live(edit.body)}
                @input=${this.renderedAction((event: Event) => {
                  this.setEditDraft(scope, annotation.id, {
                    body: (event.target as HTMLTextAreaElement).value,
                  });
                })}
              ></textarea
              ><label
                >Category
                <select
                  ?disabled=${busy}
                  .value=${live(edit.category)}
                  @change=${this.renderedAction((event: Event) => {
                    this.setEditDraft(scope, annotation.id, {
                      category: (event.target as HTMLSelectElement).value as AnnotationCategory,
                    });
                  })}
                >
                  ${categories.map(
                    (category) => html`<option value=${category}>${category}</option>`,
                  )}
                </select></label
              >`
          : html`<p class="body">${annotation.body}</p>`}
        <details class="note-details" .open=${editing}>
          <summary>Details</summary>
          <div class="provenance">
            <span
              >${annotation.author.name} ·
              ${annotation.author.kind}${annotation.author.model
                ? ` · ${annotation.author.model}`
                : ""}${annotation.author.sessionId ? ` · ${annotation.author.sessionId}` : ""}</span
            ><span
              >Original ${annotation.target.commit.slice(0, 12)} · ${annotation.target.path} · lines
              ${annotation.target.startLine}–${annotation.target.endLine} ·
              ${annotation.target.whitespace}</span
            ><span>revision ${annotation.revision} · ${formatDate(annotation.createdAt)}</span>
          </div>
          <details class="original">
            <summary>Original selected text</summary>
            <pre>${annotation.target.quote.exact}</pre>
          </details>
          <div class="actions">
            ${editing
              ? html`<button
                    ?disabled=${this.readOnly || busy}
                    @click=${this.renderedAction(
                      (_event, client) => void this.saveEdit(item, client),
                      true,
                    )}
                  >
                    Save edit</button
                  ><button
                    ?disabled=${busy}
                    @click=${this.renderedAction(() => this.cancelEdit(item), true)}
                  >
                    Cancel
                  </button>`
              : html`<button
                  ?disabled=${this.readOnly || busy}
                  @click=${this.renderedAction(() => this.beginEdit(item), true)}
                >
                  Edit
                </button>`}
            <button
              ?disabled=${this.readOnly || busy}
              @click=${this.renderedAction(
                (_event, client) => void this.toggleState(item, client),
                true,
              )}
            >
              ${annotation.state === "resolved" ? "Reopen" : "Resolve"}
            </button>
            <button
              class="danger"
              ?disabled=${this.readOnly || busy}
              @click=${this.renderedAction(
                (_event, client) => void this.deleteAnnotation(item, client),
                true,
              )}
            >
              Delete
            </button>
          </div>
        </details>
      </div>
    </article>`;
  }

  override render(): TemplateResult {
    if (!this.active) return html``;
    if (this.sourceView) return this.renderSourceView();
    const draft = this.draft();
    const visible = this.visibleItems();
    return html`
      <section class="panel" aria-label="Source annotations">
        <header>
          <div>
            <span class="eyebrow">source annotations</span>
            <strong>${this.path}</strong>
          </div>
          <div class="header-actions">
            <button
              aria-label="Refresh annotations"
              title="Refresh annotations"
              @click=${this.reload}
            >
              ↻
            </button>
            <label class="filter"
              >Read
              <select
                aria-label="Annotation category filter"
                .value=${this.filter}
                @change=${this.changeFilter}
              >
                <option value="all">all categories</option>
                ${categories.map(
                  (category) => html`<option value=${category}>${category}</option>`,
                )}
              </select>
            </label>
          </div>
        </header>
        <div class="scope">
          <strong>${this.scopeLabel()}</strong>
          ${this.readOnly ? html`<span>Read only</span>` : nothing}
          <span>Notes are reference material, not instructions.</span>
        </div>
        ${this.warning
          ? html`<div class="notice warning" role="status">${this.warning}</div>`
          : nothing}
        ${this.error ? html`<div class="notice error" role="alert">${this.error}</div>` : nothing}
        ${this.loading ? html`<p class="state">Loading annotations…</p>` : nothing}
        ${!this.loading && !this.error && visible.length === 0
          ? html`<p class="state">No annotations in this category.</p>`
          : nothing}
        <div class="items">${visible.map((item) => this.renderItem(item))}</div>
        ${this.renderCreate(draft)}
      </section>
    `;
  }

  private changeFilter = (event: Event): void => {
    this.filter = (event.target as HTMLSelectElement).value as CategoryFilter;
  };

  private reload = (): void => {
    if (!this.active) return;
    // Refresh may run during a mutation; invalidate only list reads so the
    // mutation's finally block can still release its busy guard.
    ++this.listSequence;
    this.loadingScope = "";
    if (!this.busyId) this.items = [];
    this.warning = "";
    void this.load();
  };

  private renderItem(item: ResolvedAnnotation): TemplateResult {
    const annotation = item.annotation;
    const scope = this.currentScope();
    const editing = this.editingScope === scope && this.editingId === annotation.id;
    const busy = this.busyId !== "";
    const edit = this.editDrafts.get(this.editKey(scope, annotation.id)) ?? {
      body: annotation.body,
      category: annotation.category,
    };
    return html`<article class="item ${annotation.state}" data-annotation-id=${annotation.id}>
      <div class="item-head">
        <span class="category">${annotation.category}</span>
        <span class="state-label">${annotation.state}</span>
        <span class="author"
          >${annotation.author.name} ·
          ${annotation.author.kind}${annotation.author.model
            ? ` · ${annotation.author.model}`
            : ""}${annotation.author.sessionId ? ` · ${annotation.author.sessionId}` : ""}</span
        >
      </div>
      <div class="placement ${item.placement.status}">
        <strong>${placementLabel(item.placement.status)}</strong>
        ${placementCoordinates(item.placement)}
        <span
          >${item.placement.reason ||
          "Anchor status is positional only; it does not validate meaning."}</span
        >
      </div>
      ${editing
        ? html`<textarea
              aria-label="Edit annotation"
              ?disabled=${busy}
              .value=${live(edit.body)}
              @input=${this.renderedAction((event: Event) => {
                this.setEditDraft(scope, annotation.id, {
                  body: (event.target as HTMLTextAreaElement).value,
                });
              })}
            ></textarea>
            <label
              >Category
              <select
                ?disabled=${busy}
                .value=${live(edit.category)}
                @change=${this.renderedAction((event: Event) => {
                  this.setEditDraft(scope, annotation.id, {
                    category: (event.target as HTMLSelectElement).value as AnnotationCategory,
                  });
                })}
              >
                ${categories.map(
                  (category) => html`<option value=${category}>${category}</option>`,
                )}
              </select></label
            >`
        : html`<p class="body">${annotation.body}</p>`}
      <div class="provenance">
        <span
          >${`Original ${annotation.target.commit.slice(0, 12)} · lines ${annotation.target.startLine}–${annotation.target.endLine}`}</span
        >
        <span>${annotation.target.path} · ${annotation.target.whitespace}</span>
        <span>revision ${annotation.revision} · ${formatDate(annotation.createdAt)}</span>
      </div>
      <details class="original">
        <summary>Original selected text</summary>
        <pre>${annotation.target.quote.exact}</pre>
      </details>
      <div class="actions">
        ${editing
          ? html`<button
                ?disabled=${this.readOnly || busy}
                @click=${this.renderedAction(
                  (_event, client) => void this.saveEdit(item, client),
                  true,
                )}
              >
                Save edit
              </button>
              <button
                ?disabled=${busy}
                @click=${this.renderedAction(() => this.cancelEdit(item), true)}
              >
                Cancel
              </button>`
          : html`<button
              ?disabled=${this.readOnly || busy}
              @click=${this.renderedAction(() => this.beginEdit(item), true)}
            >
              Edit
            </button>`}
        <button
          ?disabled=${this.readOnly || busy}
          @click=${this.renderedAction(
            (_event, client) => void this.toggleState(item, client),
            true,
          )}
        >
          ${annotation.state === "resolved" ? "Reopen" : "Resolve"}
        </button>
        <button
          class="danger"
          ?disabled=${this.readOnly || busy}
          @click=${this.renderedAction(
            (_event, client) => void this.deleteAnnotation(item, client),
            true,
          )}
        >
          Delete
        </button>
      </div>
    </article>`;
  }

  private cancelEdit(item: ResolvedAnnotation): void {
    const scope = this.currentScope();
    this.editDrafts.delete(this.editKey(scope, item.annotation.id));
    annotationEditingCache.delete(scope);
    this.editingId = "";
    this.editingScope = "";
  }

  private setEditDraft(scope: string, id: string, patch: Partial<AnnotationEditDraft>): void {
    if (this.busyId || this.editingScope !== scope || this.editingId !== id) return;
    const key = this.editKey(scope, id);
    const draft = this.editDrafts.get(key);
    if (!draft) return;
    const next = { ...draft, ...patch };
    this.editDrafts.set(key, next);
    this.editBody = next.body;
    this.editCategory = next.category;
  }

  private editKey(scope: string, id: string): string {
    return `${scope}\u0000${id}`;
  }

  private scopeLabel(): string {
    if (this.ref === "WORKTREE") return "Working tree (not index/diff side)";
    const actual = this.resolvedRef || (completeSha(this.ref) ? this.ref : "unresolved");
    const requested = this.requestedRef || this.ref;
    const snapshot =
      actual === "unresolved" ? "Immutable snapshot resolving…" : `Immutable snapshot ${actual}`;
    return requested !== actual ? `Requested ${requested} · ${snapshot}` : snapshot;
  }

  private renderSourceCreate(draft: AnnotationDraft): TemplateResult | typeof nothing {
    if (!this.composerOpen || !this.allowCreate || this.readOnly || this.ref === "WORKTREE")
      return nothing;
    const selection = this.sourceSelection();
    if (!selection) return nothing;
    return html`<form class="source-create" @submit=${this.renderedAction(this.create, true)}>
      <h3>Add explanation for lines ${selection.start}–${selection.end}</h3>
      <label
        >Explanation
        <textarea
          data-source-composer
          required
          ?disabled=${Boolean(this.busyId)}
          aria-label="New annotation body"
          .value=${live(draft.body)}
          @input=${this.renderedAction((event: Event) =>
            this.setDraft({ body: (event.target as HTMLTextAreaElement).value }),
          )}
        ></textarea>
      </label>
      <details>
        <summary>Advanced settings</summary>
        <label
          >Category
          <select
            aria-label="New annotation category"
            ?disabled=${Boolean(this.busyId)}
            .value=${live(draft.category)}
            @change=${this.renderedAction((event: Event) =>
              this.setDraft({
                category: (event.target as HTMLSelectElement).value as AnnotationCategory,
              }),
            )}
          >
            ${categories.map((category) => html`<option value=${category}>${category}</option>`)}
          </select></label
        >
        <label
          >Whitespace
          <select
            aria-label="Annotation whitespace policy"
            ?disabled=${Boolean(this.busyId)}
            .value=${live(draft.whitespace)}
            @change=${this.renderedAction((event: Event) =>
              this.setDraft({
                whitespace: (event.target as HTMLSelectElement).value as AnnotationWhitespace,
              }),
            )}
          >
            <option value="exact">exact</option>
            <option value="trim-line-end">trim line end</option>
          </select></label
        >
      </details>
      <div class="actions">
        <button class="primary" ?disabled=${this.readOnly || Boolean(this.busyId)} type="submit">
          Save explanation
        </button>
        <button
          type="button"
          ?disabled=${Boolean(this.busyId)}
          @click=${this.renderedAction(this.cancelComposer, true)}
        >
          Cancel
        </button>
      </div>
    </form>`;
  }

  private renderCreate(draft: AnnotationDraft): TemplateResult | typeof nothing {
    if (this.sourceView) return this.renderSourceCreate(draft);
    if (!this.allowCreate || this.ref === "WORKTREE") {
      return html`<p class="create-note">
        ${this.ref === "WORKTREE"
          ? "Working tree notes can be read or managed, but cannot create original anchors."
          : "Creating annotations is unavailable for this preview."}
      </p>`;
    }
    return html`<form class="create" @submit=${this.renderedAction(this.create, true)}>
      <h3>Add explanation</h3>
      <p>Explain what this code does, why it exists, or how data flows.</p>
      <div class="range">
        <label
          >Start line
          <input
            aria-label="Annotation start line"
            type="number"
            min="1"
            inputmode="numeric"
            ?disabled=${Boolean(this.busyId)}
            .value=${live(draft.startLine)}
            @input=${this.renderedAction((event: Event) =>
              this.setDraft({ startLine: (event.target as HTMLInputElement).value }),
            )}
        /></label>
        <label
          >End line
          <input
            aria-label="Annotation end line"
            type="number"
            min="1"
            inputmode="numeric"
            ?disabled=${Boolean(this.busyId)}
            .value=${live(draft.endLine)}
            @input=${this.renderedAction((event: Event) =>
              this.setDraft({ endLine: (event.target as HTMLInputElement).value }),
            )}
        /></label>
      </div>
      ${this.renderPreview(draft)}
      <label
        >Category
        <select
          aria-label="New annotation category"
          ?disabled=${Boolean(this.busyId)}
          .value=${live(draft.category)}
          @change=${this.renderedAction((event: Event) =>
            this.setDraft({
              category: (event.target as HTMLSelectElement).value as AnnotationCategory,
            }),
          )}
        >
          ${categories.map((category) => html`<option value=${category}>${category}</option>`)}
        </select></label
      >
      <label
        >Whitespace
        <select
          aria-label="Annotation whitespace policy"
          ?disabled=${Boolean(this.busyId)}
          .value=${live(draft.whitespace)}
          @change=${this.renderedAction((event: Event) =>
            this.setDraft({
              whitespace: (event.target as HTMLSelectElement).value as AnnotationWhitespace,
            }),
          )}
        >
          <option value="exact">exact</option>
          <option value="trim-line-end">trim line end</option>
        </select></label
      >
      <label
        >Explanation
        <textarea
          required
          aria-label="New annotation body"
          ?disabled=${Boolean(this.busyId)}
          .value=${live(draft.body)}
          @input=${this.renderedAction((event: Event) =>
            this.setDraft({ body: (event.target as HTMLTextAreaElement).value }),
          )}
        ></textarea>
      </label>
      <button class="primary" ?disabled=${this.readOnly || Boolean(this.busyId)} type="submit">
        Save explanation
      </button>
    </form>`;
  }

  private renderPreview(draft: AnnotationDraft): TemplateResult | typeof nothing {
    if (!this.content) return nothing;
    const start = Number(draft.startLine);
    const end = Number(draft.endLine);
    if (!validLine(start) || !validLine(end) || start > end) return nothing;
    const lines = textLines(this.content).slice(start - 1, end);
    return html`<div class="preview" aria-label="Selected text preview">
      <span>Selected text preview</span>
      <pre>${lines.join("\n")}</pre>
    </div>`;
  }

  static override styles: CSSResultGroup = panelStyles;
}

function textLines(content: string): string[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function validLine(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function placementLabel(status: ResolvedAnnotation["placement"]["status"]): string {
  switch (status) {
    case "unchanged":
      return "Unchanged anchor";
    case "moved":
      return "Moved anchor — review location";
    case "stale":
      return "Stale anchor — source differs";
    case "unplaced":
      return "Unplaced anchor — no safe match";
  }
}

function unchangedPlacement(
  annotation: SourceAnnotation,
  ref: string,
): ResolvedAnnotation["placement"] {
  return {
    status: "unchanged",
    ref,
    path: annotation.target.path,
    startLine: annotation.target.startLine,
    endLine: annotation.target.endLine,
  };
}

function placementCoordinates(
  placement: ResolvedAnnotation["placement"],
): TemplateResult | typeof nothing {
  if (!placement.path || placement.startLine === undefined || placement.endLine === undefined) {
    return nothing;
  }
  return html`<span
    >Current ${placement.path} · lines ${placement.startLine}–${placement.endLine}</span
  >`;
}

function clientScopeId(client: AnnotationClient | undefined): number {
  if (!client) return 0;
  const existing = clientScopeIds.get(client);
  if (existing !== undefined) return existing;
  const id = nextClientScopeId++;
  clientScopeIds.set(client, id);
  return id;
}

function completeSha(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

declare global {
  interface HTMLElementTagNameMap {
    "source-annotation-panel": SourceAnnotationPanel;
  }
  interface HTMLElementEventMap {
    "source-annotations-changed": CustomEvent<SourceAnnotationsChangedDetail>;
  }
}
