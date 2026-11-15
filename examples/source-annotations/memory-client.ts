import type {
  AnnotationClient,
  AnnotationCreate,
  AnnotationList,
  AnnotationQuery,
  AnnotationUpdate,
  ResolvedAnnotation,
  SourceAnnotation,
} from "@jpahd/source-annotations/contracts";

export const REF = "a7c841e93d504b2f8ea6921bd6c30598f12e407a";
export const PATH = "src/cache/remember.ts";
export const CONTENT = `type Entry<T> = { value: T; expiresAt: number };

/** A small, request-local cache. */
export function remember<T>(ttl: number) {
  const entries = new Map<string, Entry<T>>();

  return (key: string, compute: () => T): T => {
    const now = Date.now();
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const value = compute();
    entries.set(key, { value, expiresAt: now + ttl });
    return value;
  };
}
`;
const DATE = "2026-10-01T10:00:00.000Z";

function note(
  id: string,
  start: number,
  end: number,
  body: string,
  category: SourceAnnotation["category"],
): ResolvedAnnotation {
  return {
    annotation: {
      id,
      repositoryId: "synthetic-example",
      revision: 1,
      createdAt: DATE,
      updatedAt: DATE,
      author: { kind: "human", name: "Alex · example author" },
      body,
      category,
      state: "open",
      target: {
        kind: "git",
        commit: REF,
        blob: "b".repeat(40),
        path: PATH,
        startLine: start,
        endLine: end,
        quote: {
          exact: CONTENT.split("\n")
            .slice(start - 1, end)
            .join("\n"),
          prefix: "",
          suffix: "",
        },
        fingerprint: `synthetic-${id}`,
        whitespace: "exact",
      },
    },
    placement: { status: "unchanged", ref: REF, path: PATH, startLine: start, endLine: end },
  };
}

export function sampleNotes(): ResolvedAnnotation[] {
  const expiry = note(
    "expiry",
    8,
    10,
    "Expiry is checked at the moment of the read. Capturing the clock once keeps the comparison and the next deadline on the same timeline.",
    "explanation",
  );
  const compute = note(
    "compute",
    12,
    14,
    "Keep compute() before the write: if it throws, no partial result should enter the cache. A later call can safely retry.",
    "invariant",
  );
  const stale = note(
    "stale",
    3,
    3,
    "Should this cache also be shared between requests? Revisit after measuring the request-local hit rate.",
    "question",
  );
  stale.placement = {
    status: "stale",
    ref: REF,
    path: PATH,
    reason: "The original lifetime comment changed. Review the note before reattaching it.",
  };
  return [expiry, compute, stale];
}

/** Deliberately synthetic, volatile, revision-checked; no storage or network APIs. */
export class MemoryAnnotationClient implements AnnotationClient {
  items: ResolvedAnnotation[];
  failList = false;
  failMutation = false;
  private nextId = 1;

  constructor(items = sampleNotes()) {
    this.items = structuredClone(items);
  }

  async list(query: AnnotationQuery): Promise<AnnotationList> {
    if (this.failList)
      throw new Error(
        "Notes could not be loaded. Your source is still available. Refresh to try again.",
      );
    return {
      repositoryId: "synthetic-example",
      ref: query.ref || REF,
      items: structuredClone(
        this.items.filter(({ annotation }) => !query.path || annotation.target.path === query.path),
      ),
    };
  }

  async create(input: AnnotationCreate): Promise<SourceAnnotation> {
    if (this.failMutation)
      throw new Error("Synthetic save failure. Your draft is preserved; try again.");
    const item = note(
      `created-${this.nextId++}`,
      input.startLine,
      input.endLine,
      input.body,
      input.category || "explanation",
    );
    item.annotation.target.commit = input.ref;
    item.annotation.target.path = input.path;
    item.annotation.target.whitespace = input.whitespace || "exact";
    item.placement.ref = input.ref;
    item.placement.path = input.path;
    this.items = [...this.items, item];
    return structuredClone(item.annotation);
  }

  async update(input: AnnotationUpdate): Promise<SourceAnnotation> {
    const item = this.current(input.id, input.expectedRevision);
    item.annotation = {
      ...item.annotation,
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.state ? { state: input.state } : {}),
      revision: item.annotation.revision + 1,
      updatedAt: DATE,
    };
    return structuredClone(item.annotation);
  }

  async delete(input: { id: string; expectedRevision: number }): Promise<{ deleted: true }> {
    this.current(input.id, input.expectedRevision);
    this.items = this.items.filter(({ annotation }) => annotation.id !== input.id);
    return { deleted: true };
  }

  private current(id: string, revision: number): ResolvedAnnotation {
    if (this.failMutation)
      throw new Error("Synthetic save failure. Your draft is preserved; try again.");
    const item = this.items.find(({ annotation }) => annotation.id === id);
    if (!item || item.annotation.revision !== revision)
      throw new Error(
        "This note changed elsewhere. Refresh before saving; your draft is preserved.",
      );
    return item;
  }
}
