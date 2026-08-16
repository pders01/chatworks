import { describe, expect, test } from "bun:test";
import {
  WorkbenchExtensionHost,
  WorkbenchRegistry,
  WorkbenchStorage,
  extensionFromModule,
} from "./workbench.js";

describe("WorkbenchRegistry", () => {
  test("registers, orders, opens, and disposes views", () => {
    const registry = new WorkbenchRegistry();
    const later = registry.registerView({
      id: "example.later",
      title: "Later",
      order: 20,
      mount() {},
    });
    registry.registerView({
      id: "example.first",
      title: "First",
      order: 10,
      mount() {},
    });

    expect(registry.views().map((view) => view.id)).toEqual(["example.first", "example.later"]);
    registry.openView("example.later");
    expect(registry.activeView()).toBe("example.later");
    later.dispose();
    expect(registry.activeView()).toBe("");
  });

  test("applies context predicates to views, commands, and contributions", () => {
    const registry = new WorkbenchRegistry();
    const whenReady = (context: ReadonlyMap<string, unknown>) => context.get("ready") === true;
    registry.registerView({ id: "example.view", title: "View", when: whenReady, mount() {} });
    registry.registerCommand({ id: "example.run", title: "Run", when: whenReady, run() {} });
    registry.contribute("cards", { id: "example.card", value: { title: "Card" }, when: whenReady });

    expect(registry.views()).toHaveLength(0);
    expect(registry.commands()).toHaveLength(0);
    expect(registry.contributions("cards")).toHaveLength(0);
    registry.setContext("ready", true);
    expect(registry.views()).toHaveLength(1);
    expect(registry.commands()).toHaveLength(1);
    expect(registry.contributions("cards")).toHaveLength(1);
  });

  test("executes commands with owner-scoped context and services", async () => {
    const registry = new WorkbenchRegistry();
    registry.services.provide("example.value", 42);
    registry.registerCommand(
      {
        id: "example.read",
        title: "Read",
        run(context, suffix) {
          return `${context.extensionId}:${context.services.get<number>("example.value")}:${suffix}`;
        },
      },
      "example.extension",
    );

    expect(await registry.executeCommand("example.read", "ok")).toBe("example.extension:42:ok");
  });

  test("rejects duplicate identifiers", () => {
    const registry = new WorkbenchRegistry();
    registry.registerView({ id: "example.view", title: "View", mount() {} });
    expect(() => registry.registerView({ id: "example.view", title: "Other", mount() {} })).toThrow(
      "already registered",
    );
  });
});

describe("WorkbenchExtensionHost", () => {
  test("owns and cleans up all extension registrations", async () => {
    const registry = new WorkbenchRegistry();
    const host = new WorkbenchExtensionHost(registry);
    let activationDisposed = false;
    await host.activate({
      id: "example.extension",
      activate(context) {
        context.registerView({ id: "example.view", title: "View", mount() {} });
        context.registerCommand({ id: "example.run", title: "Run", run() {} });
        context.contribute("cards", { id: "example.card", value: "card" });
        return () => {
          activationDisposed = true;
        };
      },
    });

    expect(host.ids()).toEqual(["example.extension"]);
    expect(registry.views()).toHaveLength(1);
    expect(registry.commands()).toHaveLength(1);
    expect(registry.contributions("cards")).toHaveLength(1);

    await host.deactivate("example.extension");
    expect(activationDisposed).toBe(true);
    expect(registry.views()).toHaveLength(0);
    expect(registry.commands()).toHaveLength(0);
    expect(registry.contributions("cards")).toHaveLength(0);
  });

  test("rolls registrations back when activation fails", async () => {
    const registry = new WorkbenchRegistry();
    const host = new WorkbenchExtensionHost(registry);
    await expect(
      host.activate({
        id: "example.broken",
        activate(context) {
          context.registerView({ id: "example.leak", title: "Leak", mount() {} });
          throw new Error("broken");
        },
      }),
    ).rejects.toThrow("broken");
    expect(registry.views()).toHaveLength(0);
    expect(host.ids()).toHaveLength(0);
  });
});

describe("WorkbenchStorage", () => {
  test("namespaces JSON state per extension", () => {
    const storage = new WorkbenchStorage("example");
    expect(storage.get("columns", ["todo"])).toEqual(["todo"]);
    storage.set("columns", ["todo", "done"]);
    expect(storage.get<string[]>("columns", [])).toEqual(["todo", "done"]);
    storage.delete("columns");
    expect(storage.get<string[]>("columns", [])).toEqual([]);
  });
});

describe("extensionFromModule", () => {
  test("normalizes a function-style module", () => {
    const activate = () => {};
    expect(extensionFromModule({ id: "example", activate }, { id: "fallback" })).toEqual({
      id: "example",
      name: undefined,
      version: undefined,
      activate,
      deactivate: undefined,
    });
  });
});
