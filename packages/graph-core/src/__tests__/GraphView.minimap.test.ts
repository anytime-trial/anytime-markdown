import { GraphView } from '../viewer/GraphView';
import { createDocument, createNode } from '../types';

function makeCanvas() {
  const handlers: Record<string, ((e: unknown) => void)[]> = {};
  const ctx = {
    save() {}, restore() {}, translate() {}, scale() {}, clearRect() {}, fillRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillText() {},
    arc() {}, rect() {}, clip() {}, strokeRect() {},
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

describe('GraphView minimap', () => {
  it('ミニマップ領域のクリックはナビゲーションでノード選択しない（node-click なし）', () => {
    const { canvas, click } = makeCanvas();
    const view = new GraphView(canvas, { minimap: true });
    const doc = createDocument('t');
    // viewport 既定 {0,0,1}・dpr1 → world == 画面座標。ミニマップ箱は右下 (608..788, 458..588)。
    doc.nodes.push({ ...createNode('rect', 100, 100), id: 'n1', width: 100, height: 100 });
    doc.nodes.push({ ...createNode('rect', 650, 470), id: 'under', width: 100, height: 100 }); // ミニマップ箱の下
    view.setDocument(doc);

    const clicks: string[] = [];
    view.on('nodeClick', (id) => clicks.push(id));

    click(150, 150); // n1 本体 → node-click(n1)
    click(700, 520); // ミニマップ箱内（'under' を覆う）→ ナビゲーションのみ・node-click なし

    expect(clicks).toEqual(['n1']);
    view.destroy();
  });
});
