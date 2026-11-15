import {
  copyScope,
  messageOf,
  validScope,
  type FileIdentity,
  type SourcePreview,
  type SourcePreviewClient,
} from "./contracts.js";

export const SOURCE_PREVIEW_MAX_BYTES = 256 * 1024;
export const SOURCE_PREVIEW_MAX_CHARS = 256 * 1024;
export const SOURCE_PREVIEW_MAX_SURFACES = 20;

export interface SourcePreviewState {
  readonly surfaceId: string;
  readonly file: FileIdentity;
  readonly status: "loading" | "ready" | "error";
  readonly preview: SourcePreview | null;
  readonly error: string;
  readonly scrollTop: number;
}

/** UI snapshots, not editor buffers. Selection never implicitly re-reads a file. */
export class SourcePreviewController extends EventTarget {
  private readonly files = new Map<string, SourcePreviewState>();
  private readonly requests = new Map<string, AbortController>();
  private selected = "";
  private disposed = false;

  constructor(private client: SourcePreviewClient) {
    super();
  }

  get surfaceId(): string {
    return this.selected;
  }
  get state(): SourcePreviewState | null {
    return this.files.get(this.selected) ?? null;
  }

  selectSurface(surfaceId: string): void {
    if (this.disposed) return;
    this.selected = surfaceId;
    this.changed();
  }

  /** Changing transport invalidates every cached snapshot and pending request. */
  setClient(client: SourcePreviewClient): void {
    if (client === this.client || this.disposed) return;
    this.clear();
    this.client = client;
    this.changed();
  }

  async open(surfaceId: string, identity: FileIdentity, scrollTop = 0): Promise<void> {
    if (this.disposed || !surfaceId || !validScope(identity) || !identity.path) return;
    this.requests.get(surfaceId)?.abort();
    // Bounded insertion-ordered cache. Reopening an existing surface makes it newest.
    this.files.delete(surfaceId);
    if (this.files.size >= SOURCE_PREVIEW_MAX_SURFACES) {
      const oldest = this.files.keys().next().value!;
      this.files.delete(oldest);
      this.requests.get(oldest)?.abort();
      this.requests.delete(oldest);
    }
    const file = Object.freeze({ ...copyScope(identity), path: identity.path });
    const state: SourcePreviewState = Object.freeze({
      surfaceId,
      file,
      status: "loading",
      preview: null,
      error: "",
      scrollTop: Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
    });
    const abort = new AbortController(),
      client = this.client;
    this.requests.set(surfaceId, abort);
    this.files.set(surfaceId, state);
    this.selected = surfaceId;
    this.changed();
    try {
      const result = await client.preview(file, {
        maxBytes: SOURCE_PREVIEW_MAX_BYTES,
        signal: abort.signal,
      });
      if (!this.current(state, client)) return;
      if (result.ref !== file.ref || result.path !== file.path)
        throw new Error("Preview returned a different source identity.");
      const preview: SourcePreview = Object.freeze({
        ...result,
        content: result.binary ? "" : result.content.slice(0, SOURCE_PREVIEW_MAX_CHARS),
        truncated:
          result.truncated || (!result.binary && result.content.length > SOURCE_PREVIEW_MAX_CHARS),
      });
      this.files.set(surfaceId, Object.freeze({ ...state, status: "ready", preview }));
    } catch (error) {
      if (!this.current(state, client)) return;
      this.files.set(
        surfaceId,
        Object.freeze({ ...state, status: "error", error: messageOf(error) }),
      );
    } finally {
      if (this.requests.get(surfaceId) === abort) this.requests.delete(surfaceId);
    }
    if (!this.disposed && this.selected === surfaceId) this.changed();
  }

  refresh(expected: SourcePreviewState | null = this.state): Promise<void> {
    return expected && expected === this.state
      ? this.open(expected.surfaceId, expected.file, expected.scrollTop)
      : Promise.resolve();
  }

  close(surfaceId = this.selected): void {
    this.requests.get(surfaceId)?.abort();
    this.requests.delete(surfaceId);
    this.files.delete(surfaceId);
    if (surfaceId === this.selected) this.changed();
  }

  rememberScroll(top: number): void {
    const state = this.state;
    if (state?.status === "ready" && Number.isFinite(top) && top >= 0 && state.scrollTop !== top) {
      this.files.set(this.selected, Object.freeze({ ...state, scrollTop: top }));
      // No change notification: scrolling must not trigger a render/scroll restore loop.
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
    this.changed();
  }

  private clear(): void {
    for (const abort of this.requests.values()) abort.abort();
    this.requests.clear();
    this.files.clear();
  }

  private current(state: SourcePreviewState, client: SourcePreviewClient): boolean {
    return !this.disposed && this.client === client && this.files.get(state.surfaceId) === state;
  }

  private changed(): void {
    this.dispatchEvent(new Event("change"));
  }
}
