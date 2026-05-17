import { describe, expect, test } from "bun:test";
import { chunk } from "./chunk.js";

describe("chunk helpers", () => {
  test("token wraps a string into a token-case chunk", () => {
    const c = chunk.token("hello");
    expect(c.kind.case).toBe("token");
    if (c.kind.case === "token") expect(c.kind.value).toBe("hello");
  });

  test("started wraps a Started value", () => {
    const c = chunk.started({
      userMessageId: "u1",
      sessionId: "s1",
      warnings: [],
    });
    expect(c.kind.case).toBe("started");
    if (c.kind.case === "started") expect(c.kind.value.userMessageId).toBe("u1");
  });

  test("done wraps a Done value", () => {
    const c = chunk.done({
      sessionId: "s1",
      userMessageId: "u1",
      assistantMessageId: "a1",
      tokenCountIn: 4,
      tokenCountOut: 7,
      model: "echo",
      error: "",
    });
    expect(c.kind.case).toBe("done");
    if (c.kind.case === "done") expect(c.kind.value.tokenCountIn).toBe(4);
  });

  test("thinking takes a raw string like token", () => {
    const c = chunk.thinking("reflecting...");
    expect(c.kind.case).toBe("thinking");
  });
});
