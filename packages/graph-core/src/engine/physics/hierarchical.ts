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
        backEdges.add(`${u}\u2192${v}`);
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
    if (backEdges.has(`${from}\u2192${to}`)) {
      return { from: to, to: from };
    }
    return { from, to };
  });
}

/**
 * Group a node-to-layer map into a Map<layerNumber, nodeIds[]>.
 */
function groupByLayer(layer: Map<string, number>): Map<number, string[]> {
  const layers = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(id);
  }
  return layers;
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

  // Initialize all nodes at layer 0
  for (const id of nodeIds) layer.set(id, 0);

  // Topological-order traversal using Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) inDegree.set(id, predecessors.get(id)!.length);

  // Root nodes: in-degree 0
  const queue = nodeIds.filter(id => inDegree.get(id) === 0);

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

  return groupByLayer(layer);
}

/**
 * Reorder a single layer by barycenter values computed from neighbor positions.
 * Mutates the layer array in place.
 */
function reorderLayer(
  layer: string[],
  neighbors: (node: string) => string[],
  positionOf: Map<string, number>,
): void {
  const barycenters = computeBarycenters(layer, neighbors, positionOf);
  layer.sort((a, b) => barycenters.get(a)! - barycenters.get(b)!);
}

/**
 * Compute barycenter values for nodes in a layer based on neighbor positions.
 */
function computeBarycenters(
  layer: string[],
  neighbors: (node: string) => string[],
  positionOf: Map<string, number>,
): Map<string, number> {
  const barycenters = new Map<string, number>();
  for (const node of layer) {
    const nbrs = neighbors(node).filter(n => positionOf.has(n));
    if (nbrs.length === 0) {
      barycenters.set(node, positionOf.get(node) ?? 0);
    } else {
      const sum = nbrs.reduce((s, n) => s + (positionOf.get(n) ?? 0), 0);
      barycenters.set(node, sum / nbrs.length);
    }
  }
  return barycenters;
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
      reorderLayer(nextLayer, node => predecessors.get(node)!, positionOf);
      updatePositions();
    }

    // Bottom-up: fix layer i, reorder layer i-1
    for (let i = maxLayer; i > 0; i--) {
      const prevLayer = ordered[i - 1];
      if (prevLayer.length <= 1) continue;
      reorderLayer(prevLayer, node => successors.get(node)!, positionOf);
      updatePositions();
    }
  }

  return ordered;
}

/**
 * Create direction-aware accessors that abstract TB/LR differences.
 * - span(body): the dimension along the layer (width for TB, height for LR)
 * - depth(body): the dimension across layers (height for TB, width for LR)
 * - setPos(body, cursor, depthCursor): set x/y based on direction
 */
function makeDirectionAccessor(direction: 'TB' | 'LR') {
  if (direction === 'TB') {
    return {
      span: (body: PhysicsBody) => body.width,
      depth: (body: PhysicsBody) => body.height,
      setPos: (body: PhysicsBody, cursor: number, depthCursor: number) => {
        body.x = cursor;
        body.y = depthCursor;
      },
    };
  }
  return {
    span: (body: PhysicsBody) => body.height,
    depth: (body: PhysicsBody) => body.width,
    setPos: (body: PhysicsBody, cursor: number, depthCursor: number) => {
      body.x = depthCursor;
      body.y = cursor;
    },
  };
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
  const { span, depth, setPos } = makeDirectionAccessor(direction);

  // Find the widest layer to center all layers relative to it
  let maxLayerSpan = 0;
  for (const layer of layerOrder) {
    if (layer.length === 0) continue;
    let layerSpan = 0;
    for (const id of layer) {
      layerSpan += span(bodies.get(id)!);
    }
    layerSpan += (layer.length - 1) * nodeSpacing;
    maxLayerSpan = Math.max(maxLayerSpan, layerSpan);
  }

  // Precompute the max depth per layer
  const layerDepths: number[] = [];
  for (const layer of layerOrder) {
    let maxDepth = 0;
    for (const id of layer) {
      maxDepth = Math.max(maxDepth, depth(bodies.get(id)!));
    }
    layerDepths.push(maxDepth);
  }

  const startOffset = 100; // margin from canvas origin
  let depthCursor = startOffset;

  for (let layerIdx = 0; layerIdx < layerOrder.length; layerIdx++) {
    const layer = layerOrder[layerIdx];
    if (layer.length === 0) continue;

    // Calculate total span of this layer
    let totalSpan = 0;
    for (const id of layer) {
      totalSpan += span(bodies.get(id)!);
    }
    totalSpan += (layer.length - 1) * nodeSpacing;

    // Center this layer relative to the widest layer
    const layerOffset = (maxLayerSpan - totalSpan) / 2;

    let cursor = startOffset + layerOffset;
    for (const id of layer) {
      const body = bodies.get(id)!;
      if (body.fixed) continue;
      setPos(body, cursor, depthCursor);
      cursor += span(body) + nodeSpacing;
    }

    // Advance depth cursor by this layer's max depth + gap
    depthCursor += layerDepths[layerIdx] + levelGap;
  }
}
