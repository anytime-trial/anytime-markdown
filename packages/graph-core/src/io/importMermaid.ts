import { createNode, createEdge, createDocument, type GraphDocument, type GraphNode, type GraphEdge } from '../types';
import { createBody } from '../engine/physics/PhysicsBody';
import { computeHierarchicalLayout } from '../engine/physics/hierarchical';
import { parseNodeDef, parseEdge, tokenizeLine } from './mermaidParser';
import type { ParsedNode, ParsedEdge, SubgraphInfo } from './mermaidParser';
import {
  FRAME_PADDING, FRAME_TITLE_HEIGHT, THICK_EDGE_STROKE_WIDTH,
  MERMAID_SPACING_X_HORIZONTAL, MERMAID_SPACING_Y_HORIZONTAL,
  MERMAID_SPACING_X_VERTICAL, MERMAID_SPACING_Y_VERTICAL,
  MERMAID_LAYOUT_ORIGIN,
} from '../engine/constants';

type Direction = 'TD' | 'TB' | 'LR' | 'RL' | 'BT';

export interface MermaidImportResult {
  doc: GraphDocument;
  direction: 'TB' | 'LR';
}

/**
 * Import a Mermaid flowchart/graph string into a GraphDocument.
 * Supports: flowchart/graph, TD/TB/LR/RL/BT directions,
 * node shapes, edge types, labels, and subgraphs.
 */
export function importFromMermaid(mmdString: string): MermaidImportResult {
  const trimmed = mmdString.trim();
  if (!trimmed) throw new Error('Empty input');

  const lines = trimmed.split('\n').map(l => l.trim());

  // Parse header: flowchart/graph + direction
  const headerIdx = lines.findIndex(l => /^(flowchart|graph)\s/i.test(l));
  if (headerIdx < 0) throw new Error('Missing flowchart/graph declaration');

  const headerMatch = /^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\s*$/i.exec(lines[headerIdx]);
  const direction: Direction = (headerMatch?.[2]?.toUpperCase() as Direction) ?? 'TD';

  const nodeMap = new Map<string, ParsedNode>();
  const parsedEdges: ParsedEdge[] = [];
  const subgraphStack: SubgraphInfo[] = [];
  const nodeSubgraphMap = new Map<string, string>(); // mermaidId → subgraph mermaidId

  // Process body lines
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('%%')) continue;

    // Handle subgraph
    const subgraphMatch = /^subgraph\s+(\w+)\s*\[(.+?)\]\s*$/.exec(line)
      ?? /^subgraph\s+(.+?)\s*$/.exec(line);
    if (subgraphMatch) {
      const id = subgraphMatch[2] ? subgraphMatch[1] : subgraphMatch[1].replaceAll(/\s+/g, '_');
      const title = subgraphMatch[2] ?? subgraphMatch[1];
      subgraphStack.push({ mermaidId: id, title });
      // Register subgraph as a frame node
      nodeMap.set(id, { mermaidId: id, text: title, type: 'frame' });
      continue;
    }

    if (/^end\s*$/.test(line)) {
      subgraphStack.pop();
      continue;
    }

    // Tokenize and parse
    const tokens = tokenizeLine(line);
    if (tokens.length === 0) continue;

    let pos = 0;
    while (pos < tokens.length) {
      // Try to parse an edge starting at pos
      const edgeResult = parseEdge(tokens.slice(pos));
      if (edgeResult) {
        const { consumed, edge } = edgeResult;
        parsedEdges.push(edge);

        // Register nodes from edge (both endpoints + any inline definitions)
        for (const token of [tokens[pos], tokens[pos + consumed - 1]]) {
          const nodeDef = parseNodeDef(token);
          if (nodeDef && !nodeMap.has(nodeDef.mermaidId)) {
            nodeMap.set(nodeDef.mermaidId, nodeDef);
            if (subgraphStack.length > 0) {
              nodeSubgraphMap.set(nodeDef.mermaidId, subgraphStack.at(-1)!.mermaidId);
            }
          }
        }

        // Continue parsing from the last token (it might be the start of a chained edge)
        pos += consumed - 1;
        continue;
      }

      // Try standalone node definition
      const nodeDef = parseNodeDef(tokens[pos]);
      if (nodeDef && !nodeMap.has(nodeDef.mermaidId)) {
        nodeMap.set(nodeDef.mermaidId, nodeDef);
        if (subgraphStack.length > 0) {
          nodeSubgraphMap.set(nodeDef.mermaidId, subgraphStack.at(-1)!.mermaidId);
        }
      }
      pos++;
    }
  }

  // Build GraphDocument
  const doc = createDocument('Imported');
  const idMap = new Map<string, string>(); // mermaidId → generated UUID

  // Layout: grid positions based on direction
  const isHorizontal = direction === 'LR' || direction === 'RL';
  const spacing = {
    x: isHorizontal ? MERMAID_SPACING_X_HORIZONTAL : MERMAID_SPACING_X_VERTICAL,
    y: isHorizontal ? MERMAID_SPACING_Y_HORIZONTAL : MERMAID_SPACING_Y_VERTICAL,
  };
  const cols = isHorizontal ? Math.ceil(Math.sqrt(nodeMap.size * 2)) : Math.ceil(Math.sqrt(nodeMap.size));

  let idx = 0;
  for (const [mermaidId, parsed] of nodeMap) {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = MERMAID_LAYOUT_ORIGIN + col * spacing.x;
    const y = MERMAID_LAYOUT_ORIGIN + row * spacing.y;

    const node = createNode(parsed.type, x, y, { text: parsed.text });

    if (parsed.borderRadius) {
      node.style = { ...node.style, borderRadius: parsed.borderRadius };
    }

    idMap.set(mermaidId, node.id);
    doc.nodes.push(node);
    idx++;
  }

  // Assign groupId for subgraph children
  for (const [mermaidId, subgraphMermaidId] of nodeSubgraphMap) {
    const nodeId = idMap.get(mermaidId);
    const frameId = idMap.get(subgraphMermaidId);
    if (nodeId && frameId) {
      const node = doc.nodes.find(n => n.id === nodeId);
      if (node) node.groupId = frameId;
    }
  }

  // Create edges
  for (const pe of parsedEdges) {
    const fromNodeId = idMap.get(pe.fromId);
    const toNodeId = idMap.get(pe.toId);
    if (!fromNodeId || !toNodeId) continue;

    const fromNode = doc.nodes.find(n => n.id === fromNodeId);
    const toNode = doc.nodes.find(n => n.id === toNodeId);
    if (!fromNode || !toNode) continue;

    // Use 'connector' type for node-to-node edges (orthogonal routing)
    const edgeType = pe.hasArrow ? 'connector' : 'line';
    const edge = createEdge(
      edgeType,
      { nodeId: fromNodeId, x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 },
      { nodeId: toNodeId, x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 },
      { label: pe.label },
    );

    if (pe.dashed) edge.style = { ...edge.style, dashed: true };
    if (pe.thick) edge.style = { ...edge.style, strokeWidth: THICK_EDGE_STROKE_WIDTH };

    doc.edges.push(edge);
  }

  // Normalize direction: TD/TB/BT → 'TB', LR/RL → 'LR'
  const normalizedDirection: 'TB' | 'LR' = (direction === 'LR' || direction === 'RL') ? 'LR' : 'TB';

  return { doc, direction: normalizedDirection };
}

/**
 * Bottom-up recursive layout for nested subgroups.
 *
 * Supports arbitrary nesting depth (L1 System > L2 Container > L3 Component > L4 Code).
 *
 * Algorithm:
 * 1. Build frame tree (parent → children, including child frames)
 * 2. Topological sort: process leaf frames first, then parents (bottom-up)
 * 3. For each frame, layout its direct children (nodes + already-sized child frames)
 * 4. Set frame size from children bounding box
 * 5. Layout root-level nodes (top-level frames + orphans)
 * 6. Translate children to absolute coordinates (top-down)
 */
export function layoutWithSubgroups(
  doc: GraphDocument,
  direction: 'TB' | 'LR',
  levelGap: number,
  nodeSpacing: number,
): void {
  const frameMap = new Map(doc.nodes.filter(n => n.type === 'frame').map(n => [n.id, n]));

  // --- Build parent → direct children map (includes both frames and non-frames) ---
  const childrenOf = new Map<string, GraphNode[]>();
  const orphanNodes: GraphNode[] = [];

  for (const node of doc.nodes) {
    if (node.groupId && frameMap.has(node.groupId)) {
      const list = childrenOf.get(node.groupId) ?? [];
      list.push(node);
      childrenOf.set(node.groupId, list);
    } else if (node.type !== 'frame' || !node.groupId) {
      // Root-level frame (no parent) or non-frame without groupId
      if (node.type !== 'frame') {
        orphanNodes.push(node);
      }
    }
  }

  // --- Resolve deepest frame for each non-frame node ---
  const nodeToDeepestFrame = new Map<string, string>();
  for (const [frameId, children] of childrenOf) {
    for (const child of children) {
      if (child.type !== 'frame') {
        nodeToDeepestFrame.set(child.id, frameId);
      }
    }
  }

  // Resolve the top-level ancestor frame for edge remapping
  function resolveRootFrame(nodeId: string): string | undefined {
    let frameId = nodeToDeepestFrame.get(nodeId);
    if (!frameId) {
      // nodeId might be a frame itself
      if (frameMap.has(nodeId)) frameId = nodeId;
      else return undefined;
    }
    let current = frameId;
    while (true) {
      const frame = frameMap.get(current);
      if (!frame?.groupId || !frameMap.has(frame.groupId)) return current;
      current = frame.groupId;
    }
  }

  // --- Classify edges by frame scope ---
  const intraEdgesOf = new Map<string, GraphEdge[]>();
  const interEdges: GraphEdge[] = [];

  for (const edge of doc.edges) {
    const fromFrame = edge.from.nodeId ? nodeToDeepestFrame.get(edge.from.nodeId) : undefined;
    const toFrame = edge.to.nodeId ? nodeToDeepestFrame.get(edge.to.nodeId) : undefined;
    if (fromFrame && toFrame && fromFrame === toFrame) {
      const list = intraEdgesOf.get(fromFrame) ?? [];
      list.push(edge);
      intraEdgesOf.set(fromFrame, list);
    } else {
      interEdges.push(edge);
    }
  }

  // --- Topological sort: leaf frames first (bottom-up) ---
  const frameOrder: GraphNode[] = [];
  const visited = new Set<string>();

  function visitFrame(frame: GraphNode): void {
    if (visited.has(frame.id)) return;
    visited.add(frame.id);
    const children = childrenOf.get(frame.id) ?? [];
    for (const child of children) {
      if (child.type === 'frame') visitFrame(child);
    }
    frameOrder.push(frame);
  }

  for (const frame of frameMap.values()) {
    visitFrame(frame);
  }

  // --- Bottom-up: layout each frame's children, set frame size ---
  const childOrigins = new Map<string, { x: number; y: number }>();

  for (const frame of frameOrder) {
    const children = childrenOf.get(frame.id);
    if (!children || children.length === 0) continue;

    const bodies = new Map(children.map(n => [n.id, createBody(n)]));
    const edges = intraEdgesOf.get(frame.id) ?? [];
    computeHierarchicalLayout(bodies, edges, direction, levelGap, nodeSpacing);

    for (const child of children) {
      const body = bodies.get(child.id);
      if (body) {
        child.x = body.x;
        child.y = body.y;
      }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of children) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.width);
      maxY = Math.max(maxY, c.y + c.height);
    }

    childOrigins.set(frame.id, { x: minX, y: minY });
    frame.width = maxX - minX + FRAME_PADDING * 2;
    frame.height = maxY - minY + FRAME_PADDING * 2 + FRAME_TITLE_HEIGHT;
  }

  // --- Root layout: top-level frames + orphan nodes ---
  const rootFrames = [...frameMap.values()].filter(
    f => !f.groupId || !frameMap.has(f.groupId),
  );
  const rootNodes = [...rootFrames, ...orphanNodes];
  if (rootNodes.length === 0) return;

  const rootBodies = new Map(rootNodes.map(n => [n.id, createBody(n)]));
  const remappedEdges: GraphEdge[] = interEdges.map(edge => {
    const fromRoot = edge.from.nodeId ? resolveRootFrame(edge.from.nodeId) : undefined;
    const toRoot = edge.to.nodeId ? resolveRootFrame(edge.to.nodeId) : undefined;
    return {
      ...edge,
      from: fromRoot ? { ...edge.from, nodeId: fromRoot } : edge.from,
      to: toRoot ? { ...edge.to, nodeId: toRoot } : edge.to,
    };
  });
  computeHierarchicalLayout(rootBodies, remappedEdges, direction, levelGap, nodeSpacing);

  for (const node of rootNodes) {
    const body = rootBodies.get(node.id);
    if (body) {
      node.x = body.x;
      node.y = body.y;
    }
  }

  // --- Top-down: translate children to absolute coordinates ---
  // Process in reverse order (parents before children)
  for (let i = frameOrder.length - 1; i >= 0; i--) {
    const frame = frameOrder[i];
    const children = childrenOf.get(frame.id);
    const origin = childOrigins.get(frame.id);
    if (!children || !origin) continue;

    const dx = frame.x + FRAME_PADDING - origin.x;
    const dy = frame.y + FRAME_PADDING + FRAME_TITLE_HEIGHT - origin.y;
    for (const child of children) {
      child.x += dx;
      child.y += dy;
    }
  }

  // --- Update edge endpoints ---
  const nodeMap = new Map(doc.nodes.map(n => [n.id, n]));
  for (const edge of doc.edges) {
    const fn = edge.from.nodeId ? nodeMap.get(edge.from.nodeId) : undefined;
    const tn = edge.to.nodeId ? nodeMap.get(edge.to.nodeId) : undefined;
    if (fn) { edge.from.x = fn.x + fn.width / 2; edge.from.y = fn.y + fn.height / 2; }
    if (tn) { edge.to.x = tn.x + tn.width / 2; edge.to.y = tn.y + tn.height / 2; }
  }
}
