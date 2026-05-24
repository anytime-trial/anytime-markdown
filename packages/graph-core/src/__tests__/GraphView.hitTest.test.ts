import { GraphView } from '../viewer/GraphView';
import { createDocument, createNode } from '../types';

/** backing store (device px) と CSS 表示サイズが異なる（dpr>1）canvas を模す。 */
function makeCanvas(opts: { backingW: number; backingH: number; cssW: number; cssH: number }) {
  const handlers: Record<string, ((e: unknown) => void)[]> = {};
  const ctx = {
    save() {}, restore() {}, translate() {}, scale() {}, clearRect() {}, fillRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillText() {},
    measureText: () => ({ width: 10 }), setTransform() {},
    set fillStyle(_v: string) {}, set strokeStyle(_v: string) {}, set lineWidth(_v: number) {},
    set font(_v: string) {}, set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: opts.backingW,
    height: opts.backingH,
    getContext: () => ctx,
    addEventListener: (type: string, h: (e: unknown) => void) => {
      (handlers[type] ??= []).push(h);
    },
    removeEventListener: (type: string, h: (e: unknown) => void) => {
      handlers[type] = (handlers[type] ?? []).filter((x) => x !== h);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: opts.cssW, height: opts.cssH, right: opts.cssW, bottom: opts.cssH }),
  } as unknown as HTMLCanvasElement;
  const fire = (type: string, clientX: number, clientY: number) => {
    for (const h of handlers[type] ?? []) h({ clientX, clientY, deltaY: 0, preventDefault() {} });
  };
  return { canvas, fire };
}

describe('GraphView hit-test (HiDPI)', () => {
  it('backing≠CSS（dpr2）でも CSS 座標のクリックが正しいノードを選択する', () => {
    // backing 1600x1200, 表示 800x600 → dpr 相当 2
    const { canvas, fire } = makeCanvas({ backingW: 1600, backingH: 1200, cssW: 800, cssH: 600 });
    const view = new GraphView(canvas);
    const doc = createDocument('t');
    // viewport 既定 {0,0,scale1} なので world == device px。ノードは device 500..650 / 500..600。
    doc.nodes.push({ ...createNode('rect', 500, 500), id: 'far', width: 150, height: 100 });
    view.setDocument(doc);

    const clicks: string[] = [];
    view.on('nodeClick', (id) => clicks.push(id));

    // ノード中心 device(575,550) = CSS(287.5,275)。CSS(290,280) をクリック。
    fire('pointerdown', 290, 280);
    fire('pointerup', 290, 280);

    expect(clicks).toEqual(['far']);
    view.destroy();
  });
});
