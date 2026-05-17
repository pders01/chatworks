import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL(".", import.meta.url).pathname;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

// Forbidden: anything resolving into ../adapters or ../gen from a file
// in src/components/ or from src/host.ts. Encoded as a regex over
// relative-import specifiers (any depth of `..`).
const FORBIDDEN = /from\s+["'](?:\.\.\/)+(adapters|gen)\//;

describe("architecture: host-injection boundary", () => {
  test("components/ does not import from adapters/ or gen/", () => {
    const files = walk(join(SRC, "components"));
    const violations: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (FORBIDDEN.test(lines[i])) violations.push(`${f}:${i + 1}: ${lines[i].trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("host.ts does not import from adapters/ or gen/", () => {
    const src = readFileSync(join(SRC, "host.ts"), "utf8");
    const violations = src
      .split("\n")
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => FORBIDDEN.test(l))
      .map(({ l, i }) => `host.ts:${i + 1}: ${l.trim()}`);
    expect(violations).toEqual([]);
  });
});
