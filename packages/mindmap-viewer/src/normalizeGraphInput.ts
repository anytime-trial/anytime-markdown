import type { GraphDocument, GraphNode } from '@anytime-markdown/graph-core/types';
import { createDocument, createEdge, createNode } from '@anytime-markdown/graph-core/types';
import { computeRadialLayout, computeRootedTreeLayout, physics } from '@anytime-markdown/graph-core/engine';
import type { GraphInput } from './types';

const SUPPORTED_VERSIONS = new Set(['1.0']);

/**
 * mindmap-viewer 内部 API（公開しない）。GraphInput を内部 GraphDocument に変換し
 * レイアウトを適用して返す。Custom Element が data 設定時・テーマ変更時に呼ぶ。
 * theme は既定ノードスタイル（fill 等）の選択に使う（明示 fill は theme 非依存）。
 */
export function normalizeGraphInput(input: GraphInput, options?: { theme?: 'dark' | 'light' }): GraphDocument {
  if (!SUPPORTED_VERSIONS.has(input.schemaVersion)) {
    throw new Error(`[normalizeGraphInput] unsupported schemaVersion: ${input.schemaVersion}`);
  }
  const isDark = (options?.theme ?? 'dark') === 'dark';

  const seen = new Set<string>();
  const doc = createDocument(input.name ?? 'graph');

  for (const n of input.nodes) {
    if (n.id.trim() === '') throw new Error('[normalizeGraphInput] empty or blank node id is not allowed');
    if (seen.has(n.id)) throw new Error(`[normalizeGraphInput] duplicate node id: ${n.id}`);
    seen.add(n.id);
    const node: GraphNode = createNode(n.type ?? 'rect', 0, 0, {
      id: n.id,
      text: n.label,
      metadata: n.metadata,
      ...(n.doc !== undefined ? { docContent: n.doc } : {}),
    }, isDark);
    if (n.fill) node.style = { ...node.style, fill: n.fill };
    if (n.stroke) node.style = { ...node.style, stroke: n.stroke };
    if (n.strokeWidth !== undefined) node.style = { ...node.style, strokeWidth: n.strokeWidth };
    if (n.fontColor) node.style = { ...node.style, fontColor: n.fontColor };
    doc.nodes.push(node);
  }

  for (const e of input.edges) {
    if (!seen.has(e.from) || !seen.has(e.to)) {
      console.warn(`[normalizeGraphInput] skip edge with unknown node id: ${e.from} -> ${e.to}`);
      continue;
    }
    doc.edges.push(createEdge('connector', { nodeId: e.from, x: 0, y: 0 }, { nodeId: e.to, x: 0, y: 0 }, {
      ...(e.label !== undefined ? { label: e.label } : {}),
      ...(e.weight !== undefined ? { weight: e.weight } : {}),
    }));
  }

  const bodies = new Map(doc.nodes.map((n) => [n.id, physics.createBody(n)]));
  const layout = input.layout ?? 'radial';
  if (layout === 'radial') {
    computeRadialLayout(bodies, doc.edges, input.rootId);
  } else {
    computeRootedTreeLayout(bodies, doc.edges, input.rootId, layout === 'tree-lr' ? 'LR' : 'TB');
  }
  for (const n of doc.nodes) {
    const b = bodies.get(n.id)!;
    n.x = b.x;
    n.y = b.y;
  }

  return doc;
}
