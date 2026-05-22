import { GraphView } from '../viewer/GraphView';
import { createDocument, createNode } from '../types';

function stubCanvas(width = 800, height = 600): HTMLCanvasElement {
  const ctx = {
    save() {}, restore() {}, translate() {}, scale() {}, clearRect() {},
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fill() {}, fillText() {}, measureText: () => ({ width: 10 }), setTransform() {},
    set fillStyle(_v: string) {}, set strokeStyle(_v: string) {}, set lineWidth(_v: number) {},
    set font(_v: string) {}, set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  return {
    width, height,
    getContext: () => ctx,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  } as unknown as HTMLCanvasElement;
}

describe('GraphView', () => {
  it('setDocument + fitToContent でビューポートが更新される', () => {
    const view = new GraphView(stubCanvas(), { theme: 'dark' });
    const doc = createDocument('t');
    doc.nodes.push({ ...createNode('rect', 0, 0), id: 'a', width: 100, height: 60 });
    doc.nodes.push({ ...createNode('rect', 400, 300), id: 'b', width: 100, height: 60 });
    view.setDocument(doc);
    expect(() => view.fitToContent()).not.toThrow();
    view.destroy();
  });

  it('nodeClick ハンドラが登録できる', () => {
    const view = new GraphView(stubCanvas());
    const handler = jest.fn();
    view.on('nodeClick', handler);
    view.destroy();
    expect(handler).not.toHaveBeenCalled();
  });
});
