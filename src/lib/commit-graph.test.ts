import { describe, expect, test } from "bun:test";
import { layoutGraph, type GraphCommitInput } from "./commit-graph.js";

function linear(shas: readonly string[]): GraphCommitInput[] {
  return shas.map((sha, index) => ({
    sha,
    parentShas: index < shas.length - 1 ? [shas[index + 1]] : [],
  }));
}

describe("layoutGraph", () => {
  test("empty input returns an empty layout", () => {
    expect(layoutGraph([])).toEqual({ nodes: [], maxLane: 0 });
  });

  test("a single commit occupies lane zero", () => {
    expect(layoutGraph([{ sha: "a" }])).toEqual({
      nodes: [{ row: 0, lane: 0, parents: [] }],
      maxLane: 0,
    });
  });

  test("linear history stays in one lane", () => {
    const layout = layoutGraph(linear(["a", "b", "c", "d"]));

    expect(layout.maxLane).toBe(0);
    expect(layout.nodes.map(({ lane }) => lane)).toEqual([0, 0, 0, 0]);
  });

  test("a merge reserves a lane for its side parent", () => {
    const { nodes, maxLane } = layoutGraph([
      { sha: "a", parentShas: ["b", "c"] },
      { sha: "b", parentShas: ["d"] },
      { sha: "d" },
      { sha: "c" },
    ]);

    expect(nodes[0]).toEqual({ row: 0, lane: 0, parents: ["b", "c"] });
    expect(nodes[1].lane).toBe(0);
    expect(nodes[2].lane).toBe(0);
    expect(nodes[3].lane).toBeGreaterThan(0);
    expect(maxLane).toBeGreaterThan(0);
  });

  test("an orphan reuses a lane after the trunk finishes", () => {
    const { nodes } = layoutGraph([
      { sha: "a", parentShas: ["b"] },
      { sha: "b" },
      { sha: "orphan" },
    ]);

    expect(nodes[2].lane).toBe(0);
  });

  test("a freed side lane is reused by a later merge parent", () => {
    const { nodes, maxLane } = layoutGraph([
      { sha: "a", parentShas: ["b", "side-one"] },
      { sha: "b", parentShas: ["c"] },
      { sha: "side-one" },
      { sha: "c", parentShas: ["d", "side-two"] },
      { sha: "d" },
      { sha: "side-two" },
    ]);

    expect(nodes[2].lane).toBe(1);
    expect(nodes[5].lane).toBe(1);
    expect(maxLane).toBe(1);
  });

  test("retains parent SHAs for renderer-owned edges", () => {
    const { nodes } = layoutGraph([
      { sha: "a", parentShas: ["b", "c"] },
      { sha: "b" },
      { sha: "c" },
    ]);

    expect(nodes[0].parents).toEqual(["b", "c"]);
    expect(nodes[1].parents).toEqual([]);
  });

  test("a three-way merge opens two additional lanes", () => {
    const { maxLane } = layoutGraph([
      { sha: "a", parentShas: ["b", "c", "d"] },
      { sha: "b" },
      { sha: "c" },
      { sha: "d" },
    ]);

    expect(maxLane).toBe(2);
  });

  test("does not allocate the same parent twice", () => {
    const { maxLane } = layoutGraph([{ sha: "a", parentShas: ["b", "b"] }, { sha: "b" }]);

    expect(maxLane).toBe(0);
  });
});
