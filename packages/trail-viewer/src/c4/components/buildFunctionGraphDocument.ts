import type { FunctionGraphResponse } from '@anytime-markdown/trail-core/c4';
import { createDocument, createEdge, createNode } from '@anytime-markdown/graph-core';
import type { GraphDocument } from '@anytime-markdown/graph-core';

const FN_FILL_LIGHT = '#1976d2';
const FN_FILL_DARK = '#64b5f6';
// external_caller は呼び出し元 (周辺的) を表すためトーンを暗めにする
const EXT_FILL_LIGHT = '#bdbdbd';
const EXT_FILL_DARK = '#757575';
const CALLER_FILL_LIGHT = '#9e9e9e';
const CALLER_FILL_DARK = '#616161';

const RADIUS = 200;
const NODE_W = 140;
const NODE_H = 40;

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

  for (let i = 0; i < count; i++) {
    const n = response.nodes[i];
    const theta = (2 * Math.PI * i) / count - Math.PI / 2;
    const x = Math.round(Math.cos(theta) * RADIUS);
    const y = Math.round(Math.sin(theta) * RADIUS);
    const node = createNode('rect', x, y, {
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

  // 端点 x/y はレンダラ (resolveEdgesForRender) がノード位置から再計算するためダミー値
  for (const e of response.edges) {
    const edge = createEdge(
      'connector',
      { nodeId: e.source, x: 0, y: 0 },
      { nodeId: e.target, x: 0, y: 0 },
      { id: `${e.source}->${e.target}` },
      isDark,
    );
    doc.edges.push(edge);
  }

  return doc;
}
