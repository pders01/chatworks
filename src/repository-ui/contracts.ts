/** Browser-facing read capabilities. Hosts resolve moving refs before binding a scope. */
export interface RepositoryScope {
  readonly repositoryId: string;
  /** Immutable snapshot identity, not a branch label such as HEAD. Opaque to the UI. */
  readonly ref: string;
}

export interface FileIdentity extends RepositoryScope {
  readonly path: string;
}

export interface FileSearchResult {
  readonly ref: string;
  readonly paths: readonly string[];
  /** Matching results were cut off. Refining the query may help. */
  readonly truncated: boolean;
  /** The listing itself was bounded; absence is not proof a path does not exist. */
  readonly incomplete: boolean;
}

export interface FileSearchClient {
  search(
    scope: RepositoryScope,
    query: string,
    options: { limit: number; signal: AbortSignal },
  ): Promise<FileSearchResult>;
}

export interface SourcePreview {
  readonly ref: string;
  readonly path: string;
  readonly content: string;
  readonly binary: boolean;
  readonly truncated: boolean;
  readonly size?: number;
  readonly language?: string;
}

export interface SourcePreviewClient {
  /** Enforce maxBytes while reading, not after an unbounded read. */
  preview(
    file: FileIdentity,
    options: { maxBytes: number; signal: AbortSignal },
  ): Promise<SourcePreview>;
}

export interface RepositoryEntry {
  /** Full repository-relative path, even for children. No path normalization is applied. */
  readonly path: string;
  readonly name: string;
  readonly kind: "file" | "directory";
}

export interface RepositoryTreeResult {
  readonly ref: string;
  readonly entries: readonly RepositoryEntry[];
  readonly truncated: boolean;
  readonly incomplete: boolean;
}

export interface RepositoryTreeClient {
  children(
    scope: RepositoryScope,
    path: string,
    options: { limit: number; signal: AbortSignal },
  ): Promise<RepositoryTreeResult>;
}

export function sameScope(
  a: RepositoryScope | null | undefined,
  b: RepositoryScope | null | undefined,
): boolean {
  return !!a && !!b && a.repositoryId === b.repositoryId && a.ref === b.ref;
}

export function copyScope(scope: RepositoryScope): RepositoryScope {
  return Object.freeze({ repositoryId: scope.repositoryId, ref: scope.ref });
}

export function validScope(scope: RepositoryScope | null | undefined): scope is RepositoryScope {
  return !!scope?.repositoryId && !!scope.ref;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function emit<T>(target: EventTarget, name: string, detail: T): void {
  target.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
}
