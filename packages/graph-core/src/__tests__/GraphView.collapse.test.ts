import { GraphView } from '../viewer/GraphView';
import { bestSides, getConnectionPoints } from '../engine/index';
import { createDocument, createNode, createEdge } from '../types';
import type { GraphNode } from '../types';

function makeCanvas() {
  const handlers: Record<string, ((e: unknown) => void)[]> = {};
  const ctx = {
    save() {}, restore() {}, translate() {}, scale() {}, clearRect() {}, fillRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillText() {},
    measureText: () => ({ width: 10 }), setTransform() {},
    set fillStyle(_v: string) {}, set strokeStyle(_v: string) {}, set lineWidth(_v: number) {},
    set font(_v: string) {}, set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 800, height: 600,
    getContext: () => ctx,
    addEventListener: (t: string, h: (e: unknown) => void) => { (handlers[t] ??= []).push(h); },
    removeEventListener: (t: string, h: (e: unknown) => void) => { handlers[t] = (handlers[t] ?? []).filter((x) => x !== h); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
  } as unknown as HTMLCanvasElement;
  const click = (x: number, y: number) => {
    for (const h of handlers['pointerdown'] ?? []) h({ clientX: x, clientY: y, preventDefault() {} });
    for (const h of handlers['pointerup'] ?? []) h({ clientX: x, clientY: y, preventDefault() {} });
  };
  return { canvas, click };
}

describe('GraphView collapse (connector endpoint, mindmap fold)', () => {
  it('矩形本体クリックでは折りたたまず、コネクタ端点クリックで枝を折りたたむ', () => {
    const { canvas, click } = makeCanvas();
    const view = new GraphView(canvas, { collapsible: true });
    const doc = createDocument('t');
    // viewport 既定 {0,0,1}・dpr1 → world == クリック座標。C は P の右。
    const P: GraphNode = { ...createNode('rect', 100, 100), id: 'P', width: 100, height: 100 };
    const C: GraphNode = { ...createNode('rect', 400, 100), id: 'C', width: 100, height: 100 };
    doc.nodes.push(P, C);
    doc.edges.push(createEdge('connector', { nodeId: 'P', x: 0, y: 0 }, { nodeId: 'C', x: 0, y: 0 }));
    view.setDocument(doc);

    // ビューアと同じ計算で P→C の from 端点（P 側）を求める
    const sides = bestSides(P, C);
    const fromPts = getConnectionPoints(P);
    const fromPt = fromPts.find((p) => p.side === sides.fromSide) ?? fromPts[0];

    const clicks: string[] = [];
    view.on('nodeClick', (id) => clicks.push(id));

    click(150, 150); // P 本体中心 → 折りたたまず node-click(P)
    click(450, 150); // C 本体中心 → C は見えている（P 本体クリックで畳まれていない）→ node-click(C)
    click(fromPt.x, fromPt.y); // P の端点 → 枝を折りたたむ（node-click なし）
    click(450, 150); // C は隠れたので何も起きない

    expect(clicks).toEqual(['P', 'C']);
    view.destroy();
  });
});
