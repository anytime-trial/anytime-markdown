/**
 * @jest-environment jsdom
 */
import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';

function file(): CooccurrenceFile {
  const base: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: { nodes: [{ label: 'A', frequency: 3 }, { label: 'B', frequency: 2 }], links: [[0, 1, 4]] },
  };
  base.layout = {
    positions: [[0, 0], [50, 0]],
    specHash: computeSpecHash(base.spec),
    algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  };
  return base;
}

/** requestAnimationFrame を手動で進める。 */
let pending: FrameRequestCallback[] = [];
function flushFrames(): void {
  const queued = pending;
  pending = [];
  queued.forEach((cb) => cb(0));
}

describe('描画は要求されたときだけ行う', () => {
  beforeEach(() => {
    pending = [];
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() {}, arc() {}, fill() {}, measureText: () => ({ width: 10 }), fillText() {},
      save() {}, restore() {}, closePath() {}, translate() {}, scale() {}, rect() {}, clip() {},
      set fillStyle(_v: string) {}, set strokeStyle(_v: string) {}, set lineWidth(_v: number) {},
      set font(_v: string) {}, set globalAlpha(_v: number) {}, set textAlign(_v: string) {},
      set textBaseline(_v: string) {}, set lineJoin(_v: string) {}, set lineCap(_v: string) {},
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(window, 'requestAnimationFrame', {
      value: (cb: FrameRequestCallback) => { pending.push(cb); return pending.length; },
      configurable: true,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', { value: jest.fn(), configurable: true });
    Object.defineProperty(window, 'ResizeObserver', {
      value: class { observe(): void {} disconnect(): void {} },
      configurable: true,
    });
  });
  afterEach(() => { jest.restoreAllMocks(); document.body.replaceChildren(); });

  it('無操作では描画回数が増えない（常時ループしない）', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = mountCooccurrenceViewer(container, { file: file(), themeMode: 'light' });
    flushFrames();
    const initial = handle.getRenderFrameCount();
    expect(initial).toBeGreaterThan(0);

    // 何もせずフレームだけ進める
    for (let i = 0; i < 10; i += 1) flushFrames();
    expect(handle.getRenderFrameCount()).toBe(initial);
    handle.destroy();
  });

  it('視野を操作すると描画回数が増える（描かなくなっていない）', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = mountCooccurrenceViewer(container, { file: file(), themeMode: 'light' });
    flushFrames();
    const before = handle.getRenderFrameCount();

    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    flushFrames();
    expect(handle.getRenderFrameCount()).toBe(before + 1);
    handle.destroy();
  });

  it('複数回の変更をまとめて 1 フレームで描く', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = mountCooccurrenceViewer(container, { file: file(), themeMode: 'light' });
    flushFrames();
    const before = handle.getRenderFrameCount();

    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    for (let i = 0; i < 5; i += 1) {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true }));
    }
    flushFrames();
    expect(handle.getRenderFrameCount()).toBe(before + 1);
    handle.destroy();
  });
});
