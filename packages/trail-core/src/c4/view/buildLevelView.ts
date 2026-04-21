import type { GraphDocument, GraphNode, GraphEdge } from '@anytime-markdown/graph-core';
import type { C4ElementType } from '../types';

/** レベルごとに非フレームノードとして表示する c4Type */
const VISIBLE_C4_TYPES: Readonly<Record<number, ReadonlySet<C4ElementType>>> = {
  1: new Set<C4ElementType>(['person', 'system']),
  2: new Set<C4ElementType>(['person', 'system']),
  3: new Set<C4ElementType>(['person', 'system']),
};

/** ノードのフレーム深さを計算（ルートフレーム=1, 子フレーム=2, ...） */
export function getFrameDepth(node: GraphNode, allNodes: readonly GraphNode[]): number {
  let depth = 1;
  let parentId = node.groupId;
  while (parentId) {
    depth++;
    const parent = allNodes.find(n => n.id === parentId);
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

/**
 * C4 レベルに応じた表示用 GraphDocument を構築する。
 *
 * - L4: 全ノード表示
 * - L3: L4 ノードを非表示、L3 フレームを矩形ノードに変換
 * - L2: L3/L4 を非表示、L2 フレームを矩形ノードに変換、L1 フレームを保持
 * - L1: L1 フレームのみ矩形表示
 */
export function buildLevelView(doc: GraphDocument, level: number): GraphDocument {
  if (level >= 4) return cloneDoc(doc);

  // system フレーム（depth=1）がある場合、表示可能な深さを +1 する
  const hasSystemFrame = doc.nodes.some(
    n => n.type === 'frame' && n.metadata?.c4Type === 'system',
  );
  const maxFrameDepth = hasSystemFrame ? level : level - 1;

  // 子要素を持つフレーム ID の集合（子なしフレームは rect に変換する）
  const framesWithChildren = new Set<string>();
  for (const n of doc.nodes) {
    if (n.groupId) framesWithChildren.add(n.groupId);
  }

  const visibleNodes: GraphNode[] = [];
  const visibleNodeIds = new Set<string>();

  for (const node of doc.nodes) {
    if (node.type === 'frame') {
      const depth = getFrameDepth(node, doc.nodes);
      if (depth > maxFrameDepth) continue;
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
      visibleNodeIds.add(node.id);
    } else {
      // 非フレームノード: c4Type がレベルの表示対象なら含める（person, 外部 system 等）
      const c4Type = node.metadata?.c4Type as C4ElementType | undefined;
      const visibleTypes = VISIBLE_C4_TYPES[level];
      if (c4Type && visibleTypes?.has(c4Type)) {
        visibleNodes.push({ ...node, style: { ...node.style } });
        visibleNodeIds.add(node.id);
      }
    }
  }

  const visibleEdges: GraphEdge[] = doc.edges
    .filter(e => {
      const fromId = e.from.nodeId;
      const toId = e.to.nodeId;
      return fromId && toId && visibleNodeIds.has(fromId) && visibleNodeIds.has(toId);
    })
    .map(e => ({ ...e, from: { ...e.from }, to: { ...e.to } }));

  return { ...doc, nodes: visibleNodes, edges: visibleEdges };
}
