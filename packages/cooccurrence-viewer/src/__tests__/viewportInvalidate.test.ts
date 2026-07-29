/**
 * @jest-environment jsdom
 */
import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';
import type { CooccurrenceViewerHandle } from '../types';

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

let resizeCallbacks: Array<() => void> = [];
function fireResize(): void {
  resizeCallbacks.forEach((cb) => cb());
}

/** ミニマップの操作ボタン。タブを開いてから押す。 */
function minimapButton(action: 'zoom-in' | 'zoom-out' | 'fit'): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`.cooc-minimap__button[data-action="${action}"]`);
  if (!button) throw new Error(`ミニマップのボタンが見つからない: ${action}`);
  return button;
}

function openTab(id: 'minimap' | 'filter' | 'edit' | 'export'): void {
  const tab = document.querySelector<HTMLButtonElement>(`#cooc-panel-${id}-tab`);
  if (!tab) throw new Error(`タブが見つからない: ${id}`);
  tab.click();
}

function openMinimapTab(): void {
  openTab('minimap');
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
    resizeCallbacks = [];
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() {}, arc() {}, fill() {}, measureText: () => ({ width: 10 }), fillText() {},
      save() {}, restore() {}, closePath() {}, translate() {}, scale() {}, rect() {}, clip() {},
      roundRect() {}, strokeRect() {},
      set fillStyle(_v: string) {}, set strokeStyle(_v: string) {}, set lineWidth(_v: number) {},
      set font(_v: string) {}, set globalAlpha(_v: number) {}, set textAlign(_v: string) {},
      set textBaseline(_v: string) {}, set lineJoin(_v: string) {}, set lineCap(_v: string) {},
    } as unknown as CanvasRenderingContext2D);
    // jsdom はレイアウトを計算せず clientWidth / clientHeight が常に 0 になる。ミニマップは
    // 寸法 0 で描画を打ち切る（隠れているタブでの空振りを避けるため）ので、寸法を与えないと
    // 「描かれた回数」の検査そのものが成立しない（常に 0 で、退行と区別がつかない）。
    for (const property of ['clientWidth', 'clientHeight'] as const) {
      Object.defineProperty(HTMLElement.prototype, property, { value: 300, configurable: true });
    }
    Object.defineProperty(window, 'requestAnimationFrame', {
      value: (cb: FrameRequestCallback) => { pending.push(cb); return pending.length; },
      configurable: true,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', { value: jest.fn(), configurable: true });
    Object.defineProperty(window, 'ResizeObserver', {
      value: class {
        constructor(callback: () => void) { resizeCallbacks.push(callback); }
        observe(): void {}
        disconnect(): void {}
      },
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

  it.each([
    ['全体表示', 'fit'],
    ['拡大', 'zoom-in'],
    ['縮小', 'zoom-out'],
  ] as const)('ミニマップの %s ボタンで再描画される', (_name, action) => {
    const viewer = mount();
    openMinimapTab();
    flushFrames();
    const before = viewer.getRenderFrameCount();

    minimapButton(action).click();
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

  it('ミニマップを押すと表示位置が動いて再描画される', () => {
    const viewer = mount();
    openMinimapTab();
    flushFrames();
    const minimapCanvas = document.querySelector('.cooc-minimap__canvas');
    const before = viewer.getRenderFrameCount();

    // jsdom は PointerEvent を持たない。座標を運ぶのは MouseEvent 側の口なので、
    // 同じ型名のイベントを MouseEvent で組んで流す。
    minimapCanvas?.dispatchEvent(new MouseEvent('pointerdown', { clientX: 20, clientY: 10, bubbles: true }));
    flushFrames();

    expect(viewer.getRenderFrameCount()).toBe(before + 1);
  });

  /**
   * ミニマップは図の視野そのものを映す面であり、要求時にだけ描く。要求の書き忘れは
   * 「図だけが動いて枠が取り残される」形でしか現れず、図側の描画回数
   * （`getRenderFrameCount`）では捕まらない。専用の観測点で固定する。
   */
  describe('ミニマップの描き直し', () => {
    it('既定のミニマップタブで開いた時点で描かれる', () => {
      const viewer = mount();

      // 既定タブなので、mount 直後の 1 フレームで描かれている（仕様 §3.5）。
      expect(viewer.getMinimapDrawCount()).toBe(1);
    });

    it('別のタブから戻ると描き直される', () => {
      const viewer = mount();
      openTab('filter');
      flushFrames();
      const before = viewer.getMinimapDrawCount();

      openMinimapTab();
      flushFrames();

      expect(viewer.getMinimapDrawCount()).toBe(before + 1);
    });

    it('図を動かすと枠が追従して描き直される', () => {
      const viewer = mount();
      openMinimapTab();
      flushFrames();
      const canvas = document.querySelector('.cooc-viewer__canvas');
      const before = viewer.getMinimapDrawCount();

      canvas?.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
      flushFrames();

      expect(viewer.getMinimapDrawCount()).toBe(before + 1);
    });

    it('表示領域の寸法が変わると描き直される', () => {
      // 枠は図の canvas の寸法から計算する。視野が動かなくても、ウィンドウの大きさが
      // 変われば見えている範囲は変わる。
      const viewer = mount();
      openMinimapTab();
      flushFrames();
      const before = viewer.getMinimapDrawCount();

      fireResize();
      flushFrames();

      expect(viewer.getMinimapDrawCount()).toBe(before + 1);
    });

    it.each([
      ['ArrowRight'],
      ['ArrowLeft'],
      ['ArrowUp'],
      ['ArrowDown'],
    ])('矢印キー %s で表示位置が動いて描き直される', (key) => {
      // ポインタ専用の面にしない（キーボードだけの利用者が位置を動かせる）。
      const viewer = mount();
      openMinimapTab();
      flushFrames();
      const minimapCanvas = document.querySelector('.cooc-minimap__canvas');
      const before = viewer.getRenderFrameCount();
      const minimapBefore = viewer.getMinimapDrawCount();

      minimapCanvas?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      flushFrames();

      expect(viewer.getRenderFrameCount()).toBe(before + 1);
      expect(viewer.getMinimapDrawCount()).toBe(minimapBefore + 1);
    });

    it('隠れている間は描かない', () => {
      const viewer = mount();
      // 絞り込みタブへ移してミニマップを隠す。この状態で図を操作しても、見えていない面は
      // 描かない（図をドラッグしている間ずっと空振りするのを避ける）。
      openTab('filter');
      flushFrames();
      const canvas = document.querySelector('.cooc-viewer__canvas');
      const before = viewer.getMinimapDrawCount();

      canvas?.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
      flushFrames();

      expect(viewer.getMinimapDrawCount()).toBe(before);
    });
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
