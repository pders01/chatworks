// Lane-assignment algorithm for commit graph renderers. Pure function:
// no DOM and no Lit. Consumers own SVG or other presentation.
//
// The algorithm is a simplified first-parent-follows-lane layout:
//
//   - Each commit is placed in a row.
//   - A commit occupies the lane reserved by a child, or the leftmost
//     free lane when no child expects it.
//   - The first parent continues in the same lane.
//   - Additional merge parents reserve separate lanes.
//   - Finished lanes are reused to keep the graph narrow.

export interface GraphCommitInput {
  /** Commit's own SHA. Used as the lane key. */
  sha: string;
  /** Parent SHAs in Git order; the first parent is the trunk. */
  parentShas?: readonly string[];
}

export interface GraphNode {
  /** Zero-indexed row in the input's newest-first order. */
  row: number;
  /** Zero-indexed lane occupied by the commit. */
  lane: number;
  /** Parent SHAs retained for renderer-owned edge drawing. */
  parents: readonly string[];
}

export interface GraphLayout {
  nodes: GraphNode[];
  /** Maximum lane index used. */
  maxLane: number;
}

/**
 * Assign lanes to commits ordered newest first.
 *
 * A commit sits in a lane previously reserved for its SHA when possible.
 * Otherwise it takes the leftmost free lane. Its first parent inherits that
 * lane, while additional parents reserve other free or newly opened lanes.
 */
export function layoutGraph(commits: readonly GraphCommitInput[]): GraphLayout {
  // lanes[i] is the SHA currently expected in lane i; an empty string marks
  // a reusable lane.
  const lanes: string[] = [];
  const nodes: GraphNode[] = [];

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];
    let lane = lanes.indexOf(commit.sha);
    if (lane === -1) {
      lane = lanes.indexOf("");
      if (lane === -1) {
        lane = lanes.length;
        lanes.push("");
      }
    }

    const parents = commit.parentShas ?? [];
    lanes[lane] = parents.length > 0 ? parents[0] : "";

    for (let parentIndex = 1; parentIndex < parents.length; parentIndex++) {
      const parent = parents[parentIndex];
      if (lanes.includes(parent)) continue;

      const freeLane = lanes.indexOf("");
      if (freeLane === -1) lanes.push(parent);
      else lanes[freeLane] = parent;
    }

    nodes.push({ row, lane, parents });
  }

  const maxLane = nodes.reduce((maximum, node) => Math.max(maximum, node.lane), 0);
  return { nodes, maxLane };
}
