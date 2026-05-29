import type { FunctionGraphResponse } from '@anytime-markdown/trail-core/c4';
import { createDocument, createEdge, createNode } from '@anytime-markdown/graph-core';
import type { GraphDocument, GraphEdge } from '@anytime-markdown/graph-core';
import { computeHierarchicalLayout } from '@anytime-markdown/graph-core/engine';
import type { PhysicsBody } from '@anytime-markdown/graph-core/engine';

const FN_FILL_LIGHT = '#1976d2';
const FN_FILL_DARK = '#64b5f6';
// external_caller は呼び出し元 (周辺的) を表すためトーンを暗めにする
const EXT_FILL_LIGHT = '#bdbdbd';
const EXT_FILL_DARK = '#757575';
const CALLER_FILL_LIGHT = '#9e9e9e';
const CALLER_FILL_DARK = '#616161';

const NODE_W = 140;
const NODE_H = 40;
const LEVEL_GAP = 120;
const NODE_SPACING = NODE_W + 30;

function fillFor(kind: 'function' | 'external' | 'external_caller', isDark: boolean): string {
  if (kind === 'function') return isDark ? FN_FILL_DARK : FN_FILL_LIGHT;
  if (kind === 'external') return isDark ? EXT_FILL_DARK : EXT_FILL_LIGHT;
  return isDark ? CALLER_FILL_DARK : CALLER_FILL_LIGHT;
}

export function buildFunctionGraphDocument(
  response: FunctionGraphResponse,
  isDark: boolean,
): GraphDocument {
  const doc = createDocument(`L5: ${response.elementId}`);

  const count = response.nodes.length;
  if (count === 0) return doc;

  // 1) PhysicsBody Map を構築 (positions は (0,0) で初期化、layout が破壊的更新)
  const bodies = new Map<string, PhysicsBody>();
  for (const n of response.nodes) {
    bodies.set(n.id, {
      id: n.id,
      x: 0, y: 0,
      vx: 0, vy: 0,
      fx: 0, fy: 0,
      width: NODE_W,
      height: NODE_H,
      fixed: false,
      mass: 1,
    });
  }

  // 2) layout / レンダリング両用の GraphEdge を構築。
  //    端点 x/y はレンダラ (resolveEdgesForRender) がノード位置から再計算するためダミー値。
  const renderEdges: GraphEdge[] = response.edges.map((e) =>
    createEdge(
      'connector',
      { nodeId: e.source, x: 0, y: 0 },
      { nodeId: e.target, x: 0, y: 0 },
      { id: `${e.source}->${e.target}` },
      isDark,
    ),
  );

  // 3) 階層レイアウト (Sugiyama 風縦階層配置)。
  //    決定的・非反復、ノード数に応じて行幅 / 段高が自動拡張するため固定 RADIUS 実装の
  //    star パターン外周オーバーラップが解消する。
  computeHierarchicalLayout(bodies, renderEdges, 'TB', LEVEL_GAP, NODE_SPACING);

  // 4) 計算済み座標で GraphNode を作成
  for (const n of response.nodes) {
    const body = bodies.get(n.id)!;
    const node = createNode('rect', Math.round(body.x), Math.round(body.y), {
      id: n.id,
      text: n.label,
      width: NODE_W,
      height: NODE_H,
      style: {
        fill: fillFor(n.kind, isDark),
        stroke: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
        strokeWidth: 1,
        fontSize: 12,
        fontFamily: 'Inter, sans-serif',
      },
    }, isDark);
    doc.nodes.push(node);
  }

  for (const edge of renderEdges) {
    doc.edges.push(edge);
  }

  return doc;
}
