import type { GraphDocument, GraphNode, GraphEdge } from '@anytime-markdown/graph-core';
import type { C4ElementType } from '../types';

/** レベルごとに非フレームノードとして表示する c4Type */
const VISIBLE_C4_TYPES: Readonly<Record<number, ReadonlySet<C4ElementType>>> = {
  1: new Set<C4ElementType>(['person', 'system']),
  2: new Set<C4ElementType>(['person', 'system']),
  3: new Set<C4ElementType>(['person', 'system']),
};

/**
 * ノードのフレーム深さを計算（ルートフレーム=1, 子フレーム=2, ...）。
 *
 * 祖先探索は id 引きの繰り返しになるため、配列を渡すと毎回 O(n) の find が
 * 走り全体で O(n^2) に膨らむ。呼び出し側で一度だけ構築した `nodeById` Map を
 * 渡せば各探索が O(1) になる。後方互換のため配列も受け付ける。
 */
export function getFrameDepth(
  node: GraphNode,
  allNodes: readonly GraphNode[] | ReadonlyMap<string, GraphNode>,
): number {
  const nodeById: ReadonlyMap<string, GraphNode> =
    allNodes instanceof Map
      ? allNodes
      : new Map((allNodes as readonly GraphNode[]).map(n => [n.id, n]));
  let depth = 1;
  let parentId = node.groupId;
  while (parentId) {
    depth++;
    const parent = nodeById.get(parentId);
    parentId = parent?.groupId;
  }
  return depth;
}

function cloneDoc(doc: GraphDocument): GraphDocument {
  return {
    ...doc,
    nodes: doc.nodes.map(n => ({ ...n, style: { ...n.style } })),
    edges: doc.edges.map(e => ({ ...e, from: { ...e.from }, to: { ...e.to } })),
  };
}

export interface BuildLevelViewOptions {
  readonly showAncestorEdges?: boolean;
}

function filterAncestorEdges(
  edges: readonly GraphEdge[],
  nodeById: ReadonlyMap<string, GraphNode>,
  isAncestorNode: (node: GraphNode) => boolean,
): GraphEdge[] {
  return edges.filter((edge) => {
    const fromId = edge.from.nodeId;
    const toId = edge.to.nodeId;
    if (!fromId || !toId) return false;
    const from = nodeById.get(fromId);
    const to = nodeById.get(toId);
    return !(from && isAncestorNode(from)) && !(to && isAncestorNode(to));
  }).map(e => ({ ...e, from: { ...e.from }, to: { ...e.to } }));
}

/**
 * C4 レベルに応じた表示用 GraphDocument を構築する。
 *
 * - L4: 全ノード表示
 * - L3: L4 ノードを非表示、L3 フレームを矩形ノードに変換
 * - L2: L3/L4 を非表示、L2 フレームを矩形ノードに変換、L1 フレームを保持
 * - L1: L1 フレームのみ矩形表示
 */
export function buildLevelView(
  doc: GraphDocument,
  level: number,
  options: BuildLevelViewOptions = {},
): GraphDocument {
  const showAncestorEdges = options.showAncestorEdges ?? true;

  if (level >= 4) {
    return buildLevel4View(doc, showAncestorEdges);
  }

  // system フレーム（depth=1）がある場合、表示可能な深さを +1 する
  const hasSystemFrame = doc.nodes.some(
    n => n.type === 'frame' && n.metadata?.c4Type === 'system',
  );
  const maxFrameDepth = hasSystemFrame ? level : level - 1;

  // 子要素を持つフレーム ID の集合（子なしフレームは rect に変換する）
  const framesWithChildren = buildFramesWithChildren(doc.nodes);

  // 全ノードの id 引き Map を一度だけ構築し、深さ計算の祖先探索を O(1) にする。
  const allNodeById = new Map(doc.nodes.map(n => [n.id, n]));

  const visibleNodes: GraphNode[] = [];
  const visibleNodeIds = new Set<string>();

  for (const node of doc.nodes) {
    const added = addVisibleNode(node, allNodeById, level, maxFrameDepth, framesWithChildren, visibleNodes);
    if (added) visibleNodeIds.add(node.id);
  }
  const visibleNodeById = new Map(visibleNodes.map(n => [n.id, n]));

  const visibleEdges = filterEdgesByVisibleNodes(doc.edges, visibleNodeIds);
  const filteredEdges = showAncestorEdges
    ? visibleEdges
    : filterAncestorEdges(
      visibleEdges,
      visibleNodeById,
      node => node.type === 'frame' && getFrameDepth(node, allNodeById) < maxFrameDepth,
    );

  return { ...doc, nodes: visibleNodes, edges: filteredEdges };
}

function buildLevel4View(doc: GraphDocument, showAncestorEdges: boolean): GraphDocument {
  const cloned = cloneDoc(doc);
  if (showAncestorEdges) return cloned;
  const nodeById = new Map(cloned.nodes.map(n => [n.id, n]));
  return { ...cloned, edges: filterAncestorEdges(cloned.edges, nodeById, node => node.type === 'frame') };
}

function buildFramesWithChildren(nodes: readonly GraphNode[]): Set<string> {
  const framesWithChildren = new Set<string>();
  for (const n of nodes) {
    if (n.groupId) framesWithChildren.add(n.groupId);
  }
  return framesWithChildren;
}

function filterEdgesByVisibleNodes(
  edges: readonly GraphEdge[],
  visibleNodeIds: ReadonlySet<string>,
): GraphEdge[] {
  return edges
    .filter(e => {
      const fromId = e.from.nodeId;
      const toId = e.to.nodeId;
      return fromId && toId && visibleNodeIds.has(fromId) && visibleNodeIds.has(toId);
    })
    .map(e => ({ ...e, from: { ...e.from }, to: { ...e.to } }));
}

/** ノードを visible リストに追加する。追加した場合 true を返す。 */
function addVisibleNode(
  node: GraphNode,
  allNodeById: ReadonlyMap<string, GraphNode>,
  level: number,
  maxFrameDepth: number,
  framesWithChildren: ReadonlySet<string>,
  visibleNodes: GraphNode[],
): boolean {
  if (node.type === 'frame') {
    return addVisibleFrameNode(node, allNodeById, maxFrameDepth, framesWithChildren, visibleNodes);
  }
  return addVisibleNonFrameNode(node, level, visibleNodes);
}

function addVisibleFrameNode(
  node: GraphNode,
  allNodeById: ReadonlyMap<string, GraphNode>,
  maxFrameDepth: number,
  framesWithChildren: ReadonlySet<string>,
  visibleNodes: GraphNode[],
): boolean {
  const depth = getFrameDepth(node, allNodeById);
  if (depth > maxFrameDepth) return false;
  // depth == maxFrameDepth、または子要素なしの中間フレーム（手動登録等）は rect に変換
  const isLeaf = depth === maxFrameDepth || !framesWithChildren.has(node.id);
  if (isLeaf) {
    const c4NodeFill = node.metadata?.c4NodeFill as string | undefined;
    const c4NodeStroke = node.metadata?.c4NodeStroke as string | undefined;
    visibleNodes.push({
      ...node,
      style: {
        ...node.style,
        ...(c4NodeFill ? { fill: c4NodeFill } : {}),
        ...(c4NodeStroke ? { stroke: c4NodeStroke } : {}),
      },
      type: 'rect',
      width: 160,
      height: 60,
    });
  } else {
    visibleNodes.push({ ...node, style: { ...node.style } });
  }
  return true;
}

function addVisibleNonFrameNode(
  node: GraphNode,
  level: number,
  visibleNodes: GraphNode[],
): boolean {
  // 非フレームノード: c4Type がレベルの表示対象なら含める（person, 外部 system 等）
  const c4Type = node.metadata?.c4Type as C4ElementType | undefined;
  const visibleTypes = VISIBLE_C4_TYPES[level];
  if (c4Type && visibleTypes?.has(c4Type)) {
    visibleNodes.push({ ...node, style: { ...node.style } });
    return true;
  }
  return false;
}
