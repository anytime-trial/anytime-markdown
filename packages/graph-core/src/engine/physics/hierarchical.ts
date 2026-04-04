import type { GraphEdge } from '../../types';
import type { PhysicsBody } from './types';

/**
 * Compute hierarchical (Sugiyama-style) layout for a directed graph.
 * Non-iterative: positions are fully determined in a single pass.
 *
 * Algorithm steps:
 * 1. Cycle removal — DFS-based back-edge reversal
 * 2. Layer assignment — longest path from root nodes
 * 3. Crossing minimization — barycenter heuristic (2 passes)
 * 4. Coordinate assignment — grid placement with centering
 */
export function computeHierarchicalLayout(
  bodies: Map<string, PhysicsBody>,
  edges: GraphEdge[],
  direction: 'TB' | 'LR',
  levelGap: number,
  nodeSpacing: number,
): void {
  if (bodies.size === 0) return;

  const nodeIds = Array.from(bodies.keys());

  // Build adjacency lists (only for edges connecting known bodies)
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const id of nodeIds) {
    successors.set(id, []);
    predecessors.set(id, []);
  }

  const validEdges: Array<{ from: string; to: string }> = [];
  for (const edge of edges) {
    const fromId = edge.from.nodeId;
    const toId = edge.to.nodeId;
    if (!fromId || !toId || !bodies.has(fromId) || !bodies.has(toId)) continue;
    if (fromId === toId) continue; // skip self-loops
    validEdges.push({ from: fromId, to: toId });
    successors.get(fromId)!.push(toId);
    predecessors.get(toId)!.push(fromId);
  }

  // Step 1: Cycle removal via DFS
  const dagEdges = removeCycles(nodeIds, validEdges);

  // Rebuild adjacency with DAG edges
  const dagSuccessors = new Map<string, string[]>();
  const dagPredecessors = new Map<string, string[]>();
  for (const id of nodeIds) {
    dagSuccessors.set(id, []);
    dagPredecessors.set(id, []);
  }
  for (const { from, to } of dagEdges) {
    dagSuccessors.get(from)!.push(to);
    dagPredecessors.get(to)!.push(from);
  }

  // Step 2: Layer assignment (longest path from roots)
  const layers = assignLayers(nodeIds, dagSuccessors, dagPredecessors);

  // Step 3: Crossing minimization (barycenter heuristic)
  const layerOrder = minimizeCrossings(layers, dagSuccessors, dagPredecessors);

  // Step 4: Coordinate assignment
  assignCoordinates(bodies, layerOrder, direction, levelGap, nodeSpacing);
}

/**
 * Remove cycles by reversing back-edges detected via DFS.
 * Returns a set of directed edges forming a DAG.
 */
function removeCycles(
  nodeIds: string[],
  edges: Array<{ from: string; to: string }>,
): Array<{ from: string; to: string }> {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const { from, to } of edges) {
    adj.get(from)!.push(to);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);

  const backEdges = new Set<string>();

  function dfs(u: string): void {
    color.set(u, GRAY);
    for (const v of adj.get(u)!) {
      const cv = color.get(v)!;
      if (cv === GRAY) {
        backEdges.add(`${u}→${v}`);
      } else if (cv === WHITE) {
        dfs(v);
      }
    }
    color.set(u, BLACK);
  }

  for (const id of nodeIds) {
    if (color.get(id) === WHITE) dfs(id);
  }

  // Return edges with back-edges reversed
  return edges.map(({ from, to }) => {
    if (backEdges.has(`${from}→${to}`)) {
      return { from: to, to: from };
    }
    return { from, to };
  });
}

/**
 * Assign each node to a layer using longest-path method.
 * Root nodes (in-degree 0) are at layer 0.
 * Returns a Map from layer number to array of node IDs.
 */
function assignLayers(
  nodeIds: string[],
  successors: Map<string, string[]>,
  predecessors: Map<string, string[]>,
): Map<number, string[]> {
  const layer = new Map<string, number>();

  // Find root nodes (in-degree 0 in DAG)
  const roots = nodeIds.filter(id => predecessors.get(id)!.length === 0);

  // BFS-based longest path
  // Initialize all nodes at layer 0
  for (const id of nodeIds) layer.set(id, 0);

  // Topological-order traversal using Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) inDegree.set(id, predecessors.get(id)!.length);

  const queue = [...roots];
  // Also add isolated nodes (no predecessors and no successors)
  for (const id of nodeIds) {
    if (predecessors.get(id)!.length === 0 && !roots.includes(id)) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const v of successors.get(u)!) {
      const newLayer = layer.get(u)! + 1;
      if (newLayer > layer.get(v)!) {
        layer.set(v, newLayer);
      }
      inDegree.set(v, inDegree.get(v)! - 1);
      if (inDegree.get(v) === 0) {
        queue.push(v);
      }
    }
  }

  // Group by layer
  const layers = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(id);
  }
  return layers;
}

/**
 * Minimize edge crossings using barycenter heuristic.
 * Returns ordered layers (array of arrays, index = layer number).
 */
function minimizeCrossings(
  layers: Map<number, string[]>,
  successors: Map<string, string[]>,
  predecessors: Map<string, string[]>,
): string[][] {
  const maxLayer = Math.max(...layers.keys(), 0);
  const ordered: string[][] = [];
  for (let i = 0; i <= maxLayer; i++) {
    ordered.push(layers.get(i) ?? []);
  }

  // Build position index for barycenter calculation
  const positionOf = new Map<string, number>();
  function updatePositions(): void {
    for (const layer of ordered) {
      for (let i = 0; i < layer.length; i++) {
        positionOf.set(layer[i], i);
      }
    }
  }

  updatePositions();

  // 2-pass barycenter: top-down then bottom-up
  for (let pass = 0; pass < 2; pass++) {
    // Top-down: fix layer i, reorder layer i+1
    for (let i = 0; i < maxLayer; i++) {
      const nextLayer = ordered[i + 1];
      if (nextLayer.length <= 1) continue;

      const barycenters = new Map<string, number>();
      for (const node of nextLayer) {
        const preds = predecessors.get(node)!.filter(p => positionOf.has(p));
        if (preds.length === 0) {
          barycenters.set(node, positionOf.get(node) ?? 0);
        } else {
          const sum = preds.reduce((s, p) => s + (positionOf.get(p) ?? 0), 0);
          barycenters.set(node, sum / preds.length);
        }
      }
      nextLayer.sort((a, b) => barycenters.get(a)! - barycenters.get(b)!);
      updatePositions();
    }

    // Bottom-up: fix layer i, reorder layer i-1
    for (let i = maxLayer; i > 0; i--) {
      const prevLayer = ordered[i - 1];
      if (prevLayer.length <= 1) continue;

      const barycenters = new Map<string, number>();
      for (const node of prevLayer) {
        const succs = successors.get(node)!.filter(s => positionOf.has(s));
        if (succs.length === 0) {
          barycenters.set(node, positionOf.get(node) ?? 0);
        } else {
          const sum = succs.reduce((s, n) => s + (positionOf.get(n) ?? 0), 0);
          barycenters.set(node, sum / succs.length);
        }
      }
      prevLayer.sort((a, b) => barycenters.get(a)! - barycenters.get(b)!);
      updatePositions();
    }
  }

  return ordered;
}

/**
 * Assign x/y coordinates to each body based on layer ordering.
 * Centers each layer horizontally (or vertically for LR).
 * Layer spacing adapts to the tallest (TB) / widest (LR) node in each layer
 * so that large nodes (e.g. frame groups) never overlap the next layer.
 */
function assignCoordinates(
  bodies: Map<string, PhysicsBody>,
  layerOrder: string[][],
  direction: 'TB' | 'LR',
  levelGap: number,
  nodeSpacing: number,
): void {
  // Find the widest layer to center all layers relative to it
  let maxLayerWidth = 0;
  for (const layer of layerOrder) {
    if (layer.length === 0) continue;
    let width = 0;
    for (const id of layer) {
      const body = bodies.get(id)!;
      width += direction === 'TB' ? body.width : body.height;
    }
    width += (layer.length - 1) * nodeSpacing;
    maxLayerWidth = Math.max(maxLayerWidth, width);
  }

  // Precompute the max "depth" (height for TB, width for LR) per layer
  const layerDepths: number[] = [];
  for (const layer of layerOrder) {
    let maxDepth = 0;
    for (const id of layer) {
      const body = bodies.get(id)!;
      maxDepth = Math.max(maxDepth, direction === 'TB' ? body.height : body.width);
    }
    layerDepths.push(maxDepth);
  }

  const startOffset = 100; // margin from canvas origin

  // Accumulate layer positions based on actual node depths
  let depthCursor = startOffset;

  for (let layerIdx = 0; layerIdx < layerOrder.length; layerIdx++) {
    const layer = layerOrder[layerIdx];
    if (layer.length === 0) continue;

    // Calculate total width of this layer
    let totalSpan = 0;
    for (const id of layer) {
      const body = bodies.get(id)!;
      totalSpan += direction === 'TB' ? body.width : body.height;
    }
    totalSpan += (layer.length - 1) * nodeSpacing;

    // Center this layer relative to the widest layer
    const layerOffset = (maxLayerWidth - totalSpan) / 2;

    let cursor = startOffset + layerOffset;
    for (const id of layer) {
      const body = bodies.get(id)!;
      if (body.fixed) continue;

      if (direction === 'TB') {
        body.x = cursor;
        body.y = depthCursor;
        cursor += body.width + nodeSpacing;
      } else {
        body.x = depthCursor;
        body.y = cursor;
        cursor += body.height + nodeSpacing;
      }
    }

    // Advance depth cursor by this layer's max depth + gap
    depthCursor += layerDepths[layerIdx] + levelGap;
  }
}
