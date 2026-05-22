import { GraphView } from '../viewer/GraphView';
import { createDocument, createNode, createEdge } from '../types';

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

describe('GraphView collapse (mindmap fold)', () => {
  it('collapsible 時、子を持つノードのクリックで子孫を隠し、再クリックで戻す', () => {
    const { canvas, click } = makeCanvas();
    const view = new GraphView(canvas, { collapsible: true });
    const doc = createDocument('t');
    // viewport 既定 {0,0,1}・dpr1 → world == クリック座標
    doc.nodes.push({ ...createNode('rect', 100, 100), id: 'P', width: 150, height: 100 });
    doc.nodes.push({ ...createNode('rect', 400, 400), id: 'C', width: 150, height: 100 });
    doc.edges.push(createEdge('connector', { nodeId: 'P', x: 0, y: 0 }, { nodeId: 'C', x: 0, y: 0 }));
    view.setDocument(doc);

    const clicks: string[] = [];
    view.on('nodeClick', (id) => clicks.push(id));

    click(475, 450); // C 中心 → 表示中なので nodeClick(C)
    click(175, 150); // P 中心 → 子 C を折りたたむ + nodeClick(P)
    click(475, 450); // C は隠れたので hit しない

    expect(clicks).toEqual(['C', 'P']);

    click(175, 150); // P 再クリック → 展開 + nodeClick(P)
    click(475, 450); // C 再表示 → nodeClick(C)
    expect(clicks).toEqual(['C', 'P', 'P', 'C']);

    view.destroy();
  });
});
