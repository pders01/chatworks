export interface Disposable {
  dispose(): void;
}

export type DisposableLike = Disposable | (() => void) | void;
export type MaybePromise<T> = T | Promise<T>;
export type WorkbenchContextValue = string | number | boolean | null | undefined;
export type WorkbenchPredicate = (context: ReadonlyMap<string, WorkbenchContextValue>) => boolean;

export interface WorkbenchViewContext {
  readonly extensionId: string;
  readonly registry: WorkbenchRegistry;
  readonly services: WorkbenchServiceCollection;
}

export interface WorkbenchView {
  id: string;
  title: string;
  region?: string;
  description?: string;
  icon?: string;
  order?: number;
  when?: WorkbenchPredicate;
  mount(container: HTMLElement, context: WorkbenchViewContext): MaybePromise<DisposableLike>;
}

export interface WorkbenchCommandContext extends WorkbenchViewContext {
  readonly commandId: string;
}

export interface WorkbenchCommand {
  id: string;
  title: string;
  category?: string;
  description?: string;
  order?: number;
  when?: WorkbenchPredicate;
  run(context: WorkbenchCommandContext, ...args: unknown[]): MaybePromise<unknown>;
}

export interface WorkbenchContribution<T = unknown> {
  id: string;
  value: T;
  order?: number;
  when?: WorkbenchPredicate;
}

export interface WorkbenchExtension {
  id: string;
  name?: string;
  version?: string;
  activate(context: WorkbenchExtensionContext): MaybePromise<DisposableLike>;
  deactivate?(): MaybePromise<void>;
}

export interface WorkbenchExtensionContext extends WorkbenchViewContext {
  readonly extension: Readonly<Pick<WorkbenchExtension, "id" | "name" | "version">>;
  readonly subscriptions: Disposable[];
  readonly storage: WorkbenchStorage;
  registerView(view: WorkbenchView): Disposable;
  registerCommand(command: WorkbenchCommand): Disposable;
  contribute<T>(point: string, contribution: WorkbenchContribution<T>): Disposable;
  executeCommand(id: string, ...args: unknown[]): Promise<unknown>;
  openView(id: string): void;
}

export interface WorkbenchExtensionModule {
  default?: WorkbenchExtension;
  extension?: WorkbenchExtension;
  id?: string;
  name?: string;
  version?: string;
  activate?(context: WorkbenchExtensionContext): MaybePromise<DisposableLike>;
  deactivate?(): MaybePromise<void>;
}

interface Owned<T> {
  owner: string;
  value: T;
}

export class DisposableStore implements Disposable {
  private readonly values = new Set<Disposable>();
  private disposed = false;

  add<T extends Disposable>(value: T): T {
    if (this.disposed) value.dispose();
    else this.values.add(value);
    return value;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const value of [...this.values].reverse()) {
      try {
        value.dispose();
      } catch {
        // Disposal is best-effort so one extension cannot leak the rest.
      }
    }
    this.values.clear();
  }
}

export class WorkbenchServiceCollection {
  private readonly values = new Map<string, unknown>();

  provide<T>(id: string, value: T): Disposable {
    requireId(id, "service");
    if (this.values.has(id)) throw new Error(`Workbench service already registered: ${id}`);
    this.values.set(id, value);
    return toDisposable(() => {
      if (this.values.get(id) === value) this.values.delete(id);
    });
  }

  get<T>(id: string): T {
    if (!this.values.has(id)) throw new Error(`Workbench service is not available: ${id}`);
    return this.values.get(id) as T;
  }

  tryGet<T>(id: string): T | undefined {
    return this.values.get(id) as T | undefined;
  }

  has(id: string): boolean {
    return this.values.has(id);
  }
}

export class WorkbenchStorage {
  private readonly memory = new Map<string, string>();

  constructor(
    private readonly namespace: string,
    private readonly backend?: Storage,
  ) {}

  get<T>(key: string, fallback: T): T {
    const raw = this.read(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    const serialized = JSON.stringify(value);
    if (serialized === undefined)
      throw new Error("Workbench storage values must be JSON serializable");
    const namespaced = this.key(key);
    this.memory.set(namespaced, serialized);
    try {
      this.backend?.setItem(namespaced, serialized);
    } catch {
      // Keep the in-memory value when persistent storage is unavailable.
    }
  }

  delete(key: string): void {
    const namespaced = this.key(key);
    this.memory.delete(namespaced);
    try {
      this.backend?.removeItem(namespaced);
    } catch {
      // Storage may be blocked by the embedding host.
    }
  }

  private read(key: string): string | null {
    const namespaced = this.key(key);
    if (this.memory.has(namespaced)) return this.memory.get(namespaced) ?? null;
    try {
      return this.backend?.getItem(namespaced) ?? null;
    } catch {
      return null;
    }
  }

  private key(key: string): string {
    if (!key.trim()) throw new Error("Workbench storage keys cannot be empty");
    return `chatworks.workbench.${this.namespace}.${key}`;
  }
}

export class WorkbenchRegistry extends EventTarget {
  readonly services = new WorkbenchServiceCollection();

  private readonly viewEntries = new Map<string, Owned<WorkbenchView>>();
  private readonly commandEntries = new Map<string, Owned<WorkbenchCommand>>();
  private readonly contributionEntries = new Map<
    string,
    Map<string, Owned<WorkbenchContribution>>
  >();
  private readonly context = new Map<string, WorkbenchContextValue>();
  private readonly activeViews = new Map<string, string>();

  registerView(view: WorkbenchView, owner = "host"): Disposable {
    validateView(view);
    return this.register(this.viewEntries, view.id, { owner, value: { ...view } }, "view");
  }

  registerCommand(command: WorkbenchCommand, owner = "host"): Disposable {
    validateCommand(command);
    return this.register(
      this.commandEntries,
      command.id,
      { owner, value: { ...command } },
      "command",
    );
  }

  contribute<T>(point: string, contribution: WorkbenchContribution<T>, owner = "host"): Disposable {
    requireId(point, "contribution point");
    requireId(contribution.id, "contribution");
    let entries = this.contributionEntries.get(point);
    if (!entries) {
      entries = new Map();
      this.contributionEntries.set(point, entries);
    }
    if (entries.has(contribution.id)) {
      throw new Error(`Workbench contribution already registered: ${point}/${contribution.id}`);
    }
    const owned: Owned<WorkbenchContribution> = { owner, value: { ...contribution } };
    entries.set(contribution.id, owned);
    this.changed("contributions", contribution.id, point);
    return toDisposable(() => {
      if (entries?.get(contribution.id) !== owned) return;
      entries.delete(contribution.id);
      if (entries.size === 0) this.contributionEntries.delete(point);
      this.changed("contributions", contribution.id, point);
    });
  }

  views(region?: string): WorkbenchView[] {
    return [...this.viewEntries.values()]
      .map((entry) => entry.value)
      .filter(
        (view) =>
          (region === undefined || (view.region ?? "primary") === region) && this.visible(view),
      )
      .sort(compareContribution);
  }

  view(id: string): WorkbenchView | undefined {
    const value = this.viewEntries.get(id)?.value;
    return value && this.visible(value) ? value : undefined;
  }

  commands(): WorkbenchCommand[] {
    return [...this.commandEntries.values()]
      .map((entry) => entry.value)
      .filter((command) => this.visible(command))
      .sort(compareContribution);
  }

  command(id: string): WorkbenchCommand | undefined {
    const value = this.commandEntries.get(id)?.value;
    return value && this.visible(value) ? value : undefined;
  }

  contributions<T>(point: string): WorkbenchContribution<T>[] {
    return [...(this.contributionEntries.get(point)?.values() ?? [])]
      .map((entry) => entry.value as WorkbenchContribution<T>)
      .filter((contribution) => this.visible(contribution))
      .sort(compareContribution);
  }

  async executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
    const entry = this.commandEntries.get(id);
    if (!entry || !this.visible(entry.value))
      throw new Error(`Workbench command is not available: ${id}`);
    return await entry.value.run(
      {
        commandId: id,
        extensionId: entry.owner,
        registry: this,
        services: this.services,
      },
      ...args,
    );
  }

  openView(id: string): void {
    const view = this.view(id);
    if (!view) throw new Error(`Workbench view is not available: ${id}`);
    const region = view.region ?? "primary";
    if (this.activeViews.get(region) === id) return;
    this.activeViews.set(region, id);
    this.changed("active-view", id, region);
  }

  closeView(region = "primary"): void {
    if (!this.activeViews.delete(region)) return;
    this.changed("active-view", "", region);
  }

  activeView(region = "primary"): string {
    const id = this.activeViews.get(region) ?? "";
    if (id && !this.view(id)) {
      this.activeViews.delete(region);
      return "";
    }
    return id;
  }

  setContext(key: string, value: WorkbenchContextValue): void {
    requireId(key, "context key");
    if (Object.is(this.context.get(key), value) && this.context.has(key)) return;
    if (value === undefined) this.context.delete(key);
    else this.context.set(key, value);
    for (const [region, id] of this.activeViews) {
      if (!this.view(id)) this.activeViews.delete(region);
    }
    this.changed("context", key);
  }

  getContext(key: string): WorkbenchContextValue {
    return this.context.get(key);
  }

  contextSnapshot(): ReadonlyMap<string, WorkbenchContextValue> {
    return new Map(this.context);
  }

  viewContext(id: string): WorkbenchViewContext {
    const entry = this.viewEntries.get(id);
    if (!entry) throw new Error(`Workbench view is not registered: ${id}`);
    return { extensionId: entry.owner, registry: this, services: this.services };
  }

  private visible(value: { when?: WorkbenchPredicate }): boolean {
    try {
      return value.when?.(this.contextSnapshot()) ?? true;
    } catch {
      return false;
    }
  }

  private register<T>(
    entries: Map<string, T>,
    id: string,
    value: T,
    kind: "view" | "command",
  ): Disposable {
    if (entries.has(id)) throw new Error(`Workbench ${kind} already registered: ${id}`);
    entries.set(id, value);
    this.changed(`${kind}s`, id);
    return toDisposable(() => {
      if (entries.get(id) !== value) return;
      entries.delete(id);
      if (kind === "view") {
        for (const [region, active] of this.activeViews) {
          if (active === id) this.activeViews.delete(region);
        }
      }
      this.changed(`${kind}s`, id);
    });
  }

  private changed(kind: string, id: string, point?: string): void {
    this.dispatchEvent(
      new CustomEvent("cw:workbench-change", {
        detail: { kind, id, ...(point ? { point } : {}) },
      }),
    );
  }
}

export class WorkbenchExtensionHost {
  private readonly active = new Map<
    string,
    { extension: WorkbenchExtension; disposables: DisposableStore }
  >();

  constructor(
    readonly registry: WorkbenchRegistry,
    private readonly storageBackend = defaultStorage(),
  ) {}

  ids(): string[] {
    return [...this.active.keys()];
  }

  async activate(extension: WorkbenchExtension): Promise<void> {
    requireId(extension.id, "extension");
    if (this.active.has(extension.id))
      throw new Error(`Workbench extension already active: ${extension.id}`);

    const disposables = new DisposableStore();
    const subscriptions: Disposable[] = [];
    const extensionInfo = Object.freeze({
      id: extension.id,
      ...(extension.name ? { name: extension.name } : {}),
      ...(extension.version ? { version: extension.version } : {}),
    });
    const context: WorkbenchExtensionContext = {
      extensionId: extension.id,
      extension: extensionInfo,
      registry: this.registry,
      services: this.registry.services,
      subscriptions,
      storage: new WorkbenchStorage(extension.id, this.storageBackend),
      registerView: (view) => track(subscriptions, this.registry.registerView(view, extension.id)),
      registerCommand: (command) =>
        track(subscriptions, this.registry.registerCommand(command, extension.id)),
      contribute: (point, contribution) =>
        track(subscriptions, this.registry.contribute(point, contribution, extension.id)),
      executeCommand: async (id, ...args) => await this.registry.executeCommand(id, ...args),
      openView: (id) => this.registry.openView(id),
    };

    this.active.set(extension.id, { extension, disposables });
    try {
      const result = await extension.activate(context);
      for (const subscription of subscriptions) disposables.add(subscription);
      const activation = asDisposable(result);
      if (activation) disposables.add(activation);
    } catch (error) {
      for (const subscription of subscriptions) disposables.add(subscription);
      disposables.dispose();
      this.active.delete(extension.id);
      throw error;
    }
  }

  async deactivate(id: string): Promise<void> {
    const active = this.active.get(id);
    if (!active) return;
    this.active.delete(id);
    active.disposables.dispose();
    await active.extension.deactivate?.();
  }

  async deactivateAll(): Promise<void> {
    for (const id of [...this.active.keys()].reverse()) await this.deactivate(id);
  }
}

export function extensionFromModule(
  module: WorkbenchExtensionModule,
  fallback: { id: string; name?: string },
): WorkbenchExtension {
  const candidate = module.default ?? module.extension;
  if (candidate) return candidate;
  if (typeof module.activate !== "function") {
    throw new Error(`Extension module ${fallback.id} does not export activate()`);
  }
  return {
    id: module.id || fallback.id,
    name: module.name || fallback.name,
    version: module.version,
    activate: module.activate,
    deactivate: module.deactivate,
  };
}

export function customElementView(
  definition: Omit<WorkbenchView, "mount"> & {
    tagName: `${string}-${string}`;
    configure?: (element: HTMLElement, context: WorkbenchViewContext) => void;
  },
): WorkbenchView {
  const { tagName, configure, ...view } = definition;
  return {
    ...view,
    mount(container, context) {
      const element = document.createElement(tagName);
      configure?.(element, context);
      container.replaceChildren(element);
      return () => element.remove();
    },
  };
}

export function toDisposable(dispose: () => void): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      dispose();
    },
  };
}

export function asDisposable(value: DisposableLike): Disposable | undefined {
  if (typeof value === "function") return toDisposable(value);
  if (value && typeof value.dispose === "function") return value;
  return undefined;
}

function track(subscriptions: Disposable[], disposable: Disposable): Disposable {
  subscriptions.push(disposable);
  return disposable;
}

function compareContribution(
  left: { order?: number; title?: string; id: string },
  right: { order?: number; title?: string; id: string },
): number {
  return (
    (left.order ?? 0) - (right.order ?? 0) ||
    (left.title ?? left.id).localeCompare(right.title ?? right.id)
  );
}

function requireId(id: string, kind: string): void {
  if (!id?.trim() || /\s/.test(id))
    throw new Error(`Workbench ${kind} id must be non-empty and contain no whitespace`);
}

function validateView(view: WorkbenchView): void {
  requireId(view.id, "view");
  if (!view.title?.trim()) throw new Error(`Workbench view ${view.id} needs a title`);
  if (typeof view.mount !== "function") throw new Error(`Workbench view ${view.id} needs mount()`);
}

function validateCommand(command: WorkbenchCommand): void {
  requireId(command.id, "command");
  if (!command.title?.trim()) throw new Error(`Workbench command ${command.id} needs a title`);
  if (typeof command.run !== "function")
    throw new Error(`Workbench command ${command.id} needs run()`);
}

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
