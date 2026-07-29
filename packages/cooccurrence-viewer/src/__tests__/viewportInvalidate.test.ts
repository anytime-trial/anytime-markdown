/**
 * @jest-environment jsdom
 */
import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';
import type { CooccurrenceViewerHandle } from '../types';
import ja from '../i18n/ja.json';

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

let pending: FrameRequestCallback[] = [];
function flushFrames(): void {
  const queued = pending;
  pending = [];
  queued.forEach((cb) => cb(0));
}

function findButton(label: string): HTMLButtonElement {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.cooc-viewer__button')];
  const button = buttons.find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`ボタンが見つからない: ${label}（候補: ${buttons.map((b) => b.textContent).join(', ')}）`);
  return button;
}

/**
 * viewport を変える操作は、必ず再描画要求を伴わなければならない。
 *
 * Why: `updateCanvasSize()` は `canvas.width` へ代入するため、同じ値でも canvas の内容が
 * 消える。再描画を要求しないまま viewport だけ更新すると、画面が空のまま残り、
 * 別の操作（クリック・ホバー）で invalidate が走るまで復帰しない。
 */
describe('viewport を変える操作は再描画を要求する', () => {
  let handle: CooccurrenceViewerHandle | null = null;

  beforeEach(() => {
    pending = [];
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() {}, arc() {}, fill() {}, measureText: () => ({ width: 10 }), fillText() {},
      save() {}, restore() {}, closePath() {}, translate() {}, scale() {}, rect() {}, clip() {},
      roundRect() {},
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

  afterEach(() => {
    handle?.destroy();
    handle = null;
    jest.restoreAllMocks();
    document.body.replaceChildren();
  });

  function mount(): CooccurrenceViewerHandle {
    const container = document.createElement('div');
    document.body.appendChild(container);
    handle = mountCooccurrenceViewer(container, { file: file(), themeMode: 'light', locale: 'ja' });
    flushFrames();
    return handle;
  }

  it('全体表示ボタンで再描画される', () => {
    const viewer = mount();
    const before = viewer.getRenderFrameCount();

    findButton(ja.Cooccurrence['toolbar.fit']).click();
    flushFrames();

    expect(viewer.getRenderFrameCount()).toBe(before + 1);
  });

  it('キーボードの 0（全体表示）で再描画される', () => {
    const viewer = mount();
    const canvas = document.querySelector('canvas');
    const before = viewer.getRenderFrameCount();

    canvas?.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    flushFrames();

    expect(viewer.getRenderFrameCount()).toBe(before + 1);
  });

  it.each([
    ['拡大', '+'],
    ['縮小', '-'],
  ])('キーボードの %s で再描画される', (_name, key) => {
    const viewer = mount();
    const canvas = document.querySelector('canvas');
    const before = viewer.getRenderFrameCount();

    canvas?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    flushFrames();

    expect(viewer.getRenderFrameCount()).toBe(before + 1);
  });

  it('ホイールのズームで再描画される', () => {
    const viewer = mount();
    const canvas = document.querySelector('canvas');
    const before = viewer.getRenderFrameCount();

    canvas?.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
    flushFrames();

    expect(viewer.getRenderFrameCount()).toBe(before + 1);
  });
});
