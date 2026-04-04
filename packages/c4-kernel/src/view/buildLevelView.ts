import type { GraphDocument, GraphNode, GraphEdge } from '@anytime-markdown/graph-core';

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
 * - L2: L3/L4 を非表示、L2 フレームを矩形ノードに変換
 * - L1: L2 フレームのみ矩形表示
 */
export function buildLevelView(doc: GraphDocument, level: number): GraphDocument {
  if (level >= 4) return cloneDoc(doc);

  const maxFrameDepth = level - 1;
  const visibleNodes: GraphNode[] = [];
  const visibleNodeIds = new Set<string>();

  for (const node of doc.nodes) {
    if (node.type === 'frame') {
      const depth = getFrameDepth(node, doc.nodes);
      if (depth > maxFrameDepth) continue;
      if (depth === maxFrameDepth) {
        visibleNodes.push({
          ...node,
          style: { ...node.style },
          type: 'rect',
          width: 160,
          height: 60,
        });
      } else {
        visibleNodes.push({ ...node, style: { ...node.style } });
      }
      visibleNodeIds.add(node.id);
    }
    // 非フレームノード: level < 4 では全て除外
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
