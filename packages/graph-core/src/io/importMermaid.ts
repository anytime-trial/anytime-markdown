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
  const { direction, headerIdx } = parseHeader(lines);

  const { nodeMap, parsedEdges, nodeSubgraphMap } = parseBody(lines, headerIdx);
  const doc = buildDocument(nodeMap, parsedEdges, nodeSubgraphMap, direction);

  const normalizedDirection: 'TB' | 'LR' = (direction === 'LR' || direction === 'RL') ? 'LR' : 'TB';
  return { doc, direction: normalizedDirection };
}

/** ヘッダー行をパースして方向と行インデックスを返す */
function parseHeader(lines: string[]): { direction: Direction; headerIdx: number } {
  const headerIdx = lines.findIndex(l => /^(flowchart|graph)\s/i.test(l));
  if (headerIdx < 0) throw new Error('Missing flowchart/graph declaration');

  const headerMatch = /^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\s*$/i.exec(lines[headerIdx]);
  const direction: Direction = (headerMatch?.[2]?.toUpperCase() as Direction) ?? 'TD';
  return { direction, headerIdx };
}

interface ParseBodyResult {
  nodeMap: Map<string, ParsedNode>;
  parsedEdges: ParsedEdge[];
  nodeSubgraphMap: Map<string, string>;
}

/** ボディ行をパースしてノード・エッジ・サブグラフ情報を返す */
function parseBody(lines: string[], headerIdx: number): ParseBodyResult {
  const nodeMap = new Map<string, ParsedNode>();
  const parsedEdges: ParsedEdge[] = [];
  const subgraphStack: SubgraphInfo[] = [];
  const nodeSubgraphMap = new Map<string, string>();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('%%')) continue;

    if (tryParseSubgraph(line, subgraphStack, nodeMap)) continue;
    if (/^end\s*$/.test(line)) { subgraphStack.pop(); continue; }

    parseLine(line, nodeMap, parsedEdges, subgraphStack, nodeSubgraphMap);
  }

  return { nodeMap, parsedEdges, nodeSubgraphMap };
}

/** subgraph 宣言を試行。パースできた場合 true を返す */
function tryParseSubgraph(
  line: string,
  subgraphStack: SubgraphInfo[],
  nodeMap: Map<string, ParsedNode>,
): boolean {
  const subgraphMatch = /^subgraph\s+(\w+)\s*\[(.+?)\]\s*$/.exec(line)
    ?? /^subgraph\s+(\S+(?:\s+\S+)*)\s*$/.exec(line);
  if (!subgraphMatch) return false;

  const id = subgraphMatch[2] ? subgraphMatch[1] : subgraphMatch[1].replaceAll(/\s+/g, '_');
  const title = subgraphMatch[2] ?? subgraphMatch[1];
  subgraphStack.push({ mermaidId: id, title });
  nodeMap.set(id, { mermaidId: id, text: title, type: 'frame' });
  return true;
}

/** 1行分のトークンをパースしてノード・エッジを登録する */
function parseLine(
  line: string,
  nodeMap: Map<string, ParsedNode>,
  parsedEdges: ParsedEdge[],
  subgraphStack: SubgraphInfo[],
  nodeSubgraphMap: Map<string, string>,
): void {
  const tokens = tokenizeLine(line);
  if (tokens.length === 0) return;

  let pos = 0;
  while (pos < tokens.length) {
    const edgeResult = parseEdge(tokens.slice(pos));
    if (edgeResult) {
      const { consumed, edge } = edgeResult;
      parsedEdges.push(edge);

      for (const token of [tokens[pos], tokens[pos + consumed - 1]]) {
        registerNode(token, nodeMap, subgraphStack, nodeSubgraphMap);
      }

      pos += consumed - 1;
      continue;
    }

    registerNode(tokens[pos], nodeMap, subgraphStack, nodeSubgraphMap);
    pos++;
  }
}

/** トークンからノード定義をパースして登録する */
function registerNode(
  token: string,
  nodeMap: Map<string, ParsedNode>,
  subgraphStack: SubgraphInfo[],
  nodeSubgraphMap: Map<string, string>,
): void {
  const nodeDef = parseNodeDef(token);
  if (!nodeDef || nodeMap.has(nodeDef.mermaidId)) return;
  nodeMap.set(nodeDef.mermaidId, nodeDef);
  if (subgraphStack.length > 0) {
    nodeSubgraphMap.set(nodeDef.mermaidId, subgraphStack.at(-1)!.mermaidId);
  }
}

/** パース結果から GraphDocument を構築する */
function buildDocument(
  nodeMap: Map<string, ParsedNode>,
  parsedEdges: ParsedEdge[],
  nodeSubgraphMap: Map<string, string>,
  direction: Direction,
): GraphDocument {
  const doc = createDocument('Imported');
  const idMap = new Map<string, string>();

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

  assignGroupIds(doc, idMap, nodeSubgraphMap);
  createEdges(doc, parsedEdges, idMap);

  return doc;
}

/** サブグラフの子ノードに groupId を設定する */
function assignGroupIds(
  doc: GraphDocument,
  idMap: Map<string, string>,
  nodeSubgraphMap: Map<string, string>,
): void {
  for (const [mermaidId, subgraphMermaidId] of nodeSubgraphMap) {
    const nodeId = idMap.get(mermaidId);
    const frameId = idMap.get(subgraphMermaidId);
    if (!nodeId || !frameId) continue;
    const node = doc.nodes.find(n => n.id === nodeId);
    if (node) node.groupId = frameId;
  }
}

/** パース済みエッジから GraphEdge を生成して doc に追加する */
function createEdges(
  doc: GraphDocument,
  parsedEdges: ParsedEdge[],
  idMap: Map<string, string>,
): void {
  for (const pe of parsedEdges) {
    const fromNodeId = idMap.get(pe.fromId);
    const toNodeId = idMap.get(pe.toId);
    if (!fromNodeId || !toNodeId) continue;

    const fromNode = doc.nodes.find(n => n.id === fromNodeId);
    const toNode = doc.nodes.find(n => n.id === toNodeId);
    if (!fromNode || !toNode) continue;

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
}

/**
 * Bottom-up recursive layout for nested subgroups.
 *
 * Supports arbitrary nesting depth (L1 System > L2 Container > L3 Component > L4 Code).
 *
 * Algorithm:
 * 1. Build frame tree (parent -> children, including child frames)
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
  const { childrenOf, orphanNodes } = buildChildrenMap(doc.nodes, frameMap);
  const { nodeToDeepestFrame, intraEdgesOf, interEdges } = classifyEdges(doc, childrenOf, frameMap);
  const frameOrder = topologicalSortFrames(frameMap, childrenOf);

  const childOrigins = layoutFrameChildren(frameOrder, childrenOf, intraEdgesOf, direction, levelGap, nodeSpacing);
  layoutRootNodes(doc, frameMap, orphanNodes, interEdges, nodeToDeepestFrame, direction, levelGap, nodeSpacing);
  translateChildrenToAbsolute(frameOrder, childrenOf, childOrigins);
  updateEdgeEndpoints(doc);
}

/** parent -> direct children マップとルートレベルの孤立ノードを構築する */
function buildChildrenMap(
  nodes: GraphNode[],
  frameMap: Map<string, GraphNode>,
): { childrenOf: Map<string, GraphNode[]>; orphanNodes: GraphNode[] } {
  const childrenOf = new Map<string, GraphNode[]>();
  const orphanNodes: GraphNode[] = [];

  for (const node of nodes) {
    if (node.groupId && frameMap.has(node.groupId)) {
      const list = childrenOf.get(node.groupId) ?? [];
      list.push(node);
      childrenOf.set(node.groupId, list);
    } else if (node.type !== 'frame' || !node.groupId) {
      if (node.type !== 'frame') {
        orphanNodes.push(node);
      }
    }
  }

  return { childrenOf, orphanNodes };
}

/** エッジをフレーム内部と外部に分類する */
function classifyEdges(
  doc: GraphDocument,
  childrenOf: Map<string, GraphNode[]>,
  frameMap: Map<string, GraphNode>,
): {
  nodeToDeepestFrame: Map<string, string>;
  intraEdgesOf: Map<string, GraphEdge[]>;
  interEdges: GraphEdge[];
} {
  const nodeToDeepestFrame = new Map<string, string>();
  for (const [frameId, children] of childrenOf) {
    for (const child of children) {
      if (child.type !== 'frame') {
        nodeToDeepestFrame.set(child.id, frameId);
      }
    }
  }

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

  return { nodeToDeepestFrame, intraEdgesOf, interEdges };
}

/** フレームをボトムアップ順（リーフ優先）にトポロジカルソートする */
function topologicalSortFrames(
  frameMap: Map<string, GraphNode>,
  childrenOf: Map<string, GraphNode[]>,
): GraphNode[] {
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
  return frameOrder;
}

/** ボトムアップ: 各フレーム内の子要素をレイアウトし、フレームサイズを設定する */
function layoutFrameChildren(
  frameOrder: GraphNode[],
  childrenOf: Map<string, GraphNode[]>,
  intraEdgesOf: Map<string, GraphEdge[]>,
  direction: 'TB' | 'LR',
  levelGap: number,
  nodeSpacing: number,
): Map<string, { x: number; y: number }> {
  const childOrigins = new Map<string, { x: number; y: number }>();

  for (const frame of frameOrder) {
    const children = childrenOf.get(frame.id);
    if (!children || children.length === 0) continue;

    const bodies = new Map(children.map(n => [n.id, createBody(n)]));
    const edges = intraEdgesOf.get(frame.id) ?? [];
    computeHierarchicalLayout(bodies, edges, direction, levelGap, nodeSpacing);

    for (const child of children) {
      const body = bodies.get(child.id);
      if (body) { child.x = body.x; child.y = body.y; }
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

  return childOrigins;
}

/** ルートレベル（トップレベルフレーム + 孤立ノード）のレイアウト */
function layoutRootNodes(
  doc: GraphDocument,
  frameMap: Map<string, GraphNode>,
  orphanNodes: GraphNode[],
  interEdges: GraphEdge[],
  nodeToDeepestFrame: Map<string, string>,
  direction: 'TB' | 'LR',
  levelGap: number,
  nodeSpacing: number,
): void {
  const rootFrames = [...frameMap.values()].filter(
    f => !f.groupId || !frameMap.has(f.groupId),
  );
  const rootNodes = [...rootFrames, ...orphanNodes];
  if (rootNodes.length === 0) return;

  function resolveRootFrame(nodeId: string): string | undefined {
    let frameId = nodeToDeepestFrame.get(nodeId);
    if (!frameId) {
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
    if (body) { node.x = body.x; node.y = body.y; }
  }
}

/** トップダウン: 子要素を親フレームの絶対座標に変換する */
function translateChildrenToAbsolute(
  frameOrder: GraphNode[],
  childrenOf: Map<string, GraphNode[]>,
  childOrigins: Map<string, { x: number; y: number }>,
): void {
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
}

/** エッジのエンドポイント座標をノード中心に更新する */
function updateEdgeEndpoints(doc: GraphDocument): void {
  const nodeMap = new Map(doc.nodes.map(n => [n.id, n]));
  for (const edge of doc.edges) {
    const fn = edge.from.nodeId ? nodeMap.get(edge.from.nodeId) : undefined;
    const tn = edge.to.nodeId ? nodeMap.get(edge.to.nodeId) : undefined;
    if (fn) { edge.from.x = fn.x + fn.width / 2; edge.from.y = fn.y + fn.height / 2; }
    if (tn) { edge.to.x = tn.x + tn.width / 2; edge.to.y = tn.y + tn.height / 2; }
  }
}
