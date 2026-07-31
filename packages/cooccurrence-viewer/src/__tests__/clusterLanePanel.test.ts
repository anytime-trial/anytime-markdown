/**
 * @jest-environment jsdom
 */
import {
  BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  computeSpecHash,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';
import type { CooccurrenceViewerHandle, CooccurrenceViewerOptions } from '../types';

/**
 * クラスタ 0 = Alpha / Beta、クラスタ 1 = Gamma、未分類 = Delta。
 * 座標は y をわざと入り混じらせ、レーン化が「元の順序」ではなく所属で決まることを見えるようにする。
 */
function file(options: { clusters?: boolean; timeline?: boolean } = {}): CooccurrenceFile {
  const base: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
        { label: 'Gamma', frequency: 4 },
        { label: 'Delta', frequency: 1 },
      ],
      links: [
        [0, 1, 4],
        [1, 2, 2],
      ],
      ...(options.clusters === false
        ? {}
        : {
            clusters: [
              { label: '赤', members: [0, 1] },
              { label: '青', members: [2] },
            ],
          }),
    },
  };
  if (options.timeline === true) {
    base.meta.schemaVersion = 4;
    base.spec.timeline = {
      slices: [{ label: '前期' }, { label: '後期' }],
      nodes: [
        [
          [0, 3],
          [1, 2],
          [2, 4],
          [3, 1],
        ],
        [
          [0, 2],
          [1, 1],
          [2, 3],
          [3, 1],
        ],
      ],
      links: [
        [
          [0, 4],
          [1, 2],
        ],
        [
          [0, 3],
          [1, 1],
        ],
      ],
    };
  }
  base.layout = {
    positions: [
      [0, 0],
      [40, 30],
      [10, 400],
      [-60, -250],
    ],
    specHash: computeSpecHash(base.spec),
    algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  };
  return base;
}

function flush(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

interface Mounted {
  container: HTMLElement;
  handle: CooccurrenceViewerHandle;
}

function mount(initial: Partial<CooccurrenceViewerOptions> & { file: CooccurrenceFile }): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCooccurrenceViewer(container, { themeMode: 'light', ...initial });
  return { container, handle };
}

function openTab(container: HTMLElement, id: string): void {
  const tab = container.querySelector(`#cooc-panel-${id}-tab`) as HTMLButtonElement;
  tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function laneToggle(container: HTMLElement): HTMLInputElement {
  return container.querySelector('.cooc-clusters__lane input[type="checkbox"]') as HTMLInputElement;
}

function laneGapInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('.cooc-clusters__lane input[type="number"]') as HTMLInputElement;
}

function enableLanes(container: HTMLElement): void {
  openTab(container, 'clusters');
  const toggle = laneToggle(container);
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
}

/** 時間タブの並べる向きを切り替える。 */
function setLayerAxis(container: HTMLElement, axis: 'horizontal' | 'vertical'): void {
  openTab(container, 'timeline');
  const select = container.querySelector('.cooc-timeline__field') as HTMLSelectElement;
  select.value = axis;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('クラスタレーン表示', () => {
  beforeEach(() => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    Object.defineProperty(window, 'requestAnimationFrame', { value: jest.fn(() => 1), configurable: true });
    Object.defineProperty(window, 'cancelAnimationFrame', { value: jest.fn(), configurable: true });
    Object.defineProperty(window, 'ResizeObserver', {
      value: class {
        observe(): void {}
        disconnect(): void {}
      },
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
    for (const id of [
      'cooccurrence-viewer-style',
      'cooccurrence-cluster-list-panel-style',
      'cooccurrence-timeline-panel-style',
      'cooccurrence-slice-value-editor-style',
      'cooccurrence-button-base-style',
    ]) {
      document.getElementById(id)?.remove();
    }
  });

  it('既定ではレーン表示でない', async () => {
    const mounted = mount({ file: file() });
    await flush();
    expect(mounted.handle.getClusterLaneState()).toBeNull();
    mounted.handle.destroy();
  });

  it('クラスタタブのチェックでレーン化し、未分類レーンを含む本数を返す', async () => {
    const mounted = mount({ file: file() });
    await flush();
    enableLanes(mounted.container);

    const state = mounted.handle.getClusterLaneState();
    // クラスタ 2 本 + 未分類 1 本。
    expect(state).toEqual({ axis: 'vertical', laneCount: 3, hasUnclustered: true });
    mounted.handle.destroy();
  });

  it('未分類の語が無ければ未分類レーンを作らない', async () => {
    const base = file();
    base.spec.clusters = [
      { label: '赤', members: [0, 1] },
      { label: '青', members: [2, 3] },
    ];
    base.layout!.specHash = computeSpecHash(base.spec);
    const mounted = mount({ file: base });
    await flush();
    enableLanes(mounted.container);

    expect(mounted.handle.getClusterLaneState()).toEqual({
      axis: 'vertical',
      laneCount: 2,
      hasUnclustered: false,
    });
    mounted.handle.destroy();
  });

  it('クラスタが 1 つも無ければレーン化のチェックを操作できない', async () => {
    const mounted = mount({ file: file({ clusters: false }) });
    await flush();
    openTab(mounted.container, 'clusters');
    expect(laneToggle(mounted.container).disabled).toBe(true);
    expect(laneGapInput(mounted.container).disabled).toBe(true);
    mounted.handle.destroy();
  });

  describe('スライス軸との直交（要件書 §2.1）', () => {
    it('スライスが横並びならレーンは縦', async () => {
      const mounted = mount({ file: file({ timeline: true }) });
      await flush();
      enableLanes(mounted.container);

      expect(mounted.handle.getTimelineLayerState()?.axis).toBe('horizontal');
      expect(mounted.handle.getClusterLaneState()?.axis).toBe('vertical');
      mounted.handle.destroy();
    });

    it('スライスを縦並びに切り替えるとレーンは横になる', async () => {
      const mounted = mount({ file: file({ timeline: true }) });
      await flush();
      enableLanes(mounted.container);
      setLayerAxis(mounted.container, 'vertical');

      expect(mounted.handle.getTimelineLayerState()?.axis).toBe('vertical');
      expect(mounted.handle.getClusterLaneState()?.axis).toBe('horizontal');
      mounted.handle.destroy();
    });

    it('スライスを持たないファイルではレーンは縦', async () => {
      const mounted = mount({ file: file() });
      await flush();
      enableLanes(mounted.container);
      expect(mounted.handle.getClusterLaneState()?.axis).toBe('vertical');
      mounted.handle.destroy();
    });
  });

  describe('レイヤー間の点線（要件書 §2.5）', () => {
    it('レーン化しても点線の本数は変わらない', async () => {
      const mounted = mount({ file: file({ timeline: true }) });
      await flush();
      const before = mounted.handle.getTimelineLayerState()?.timeLinkCount;
      enableLanes(mounted.container);
      const after = mounted.handle.getTimelineLayerState()?.timeLinkCount;

      // 語 4 つが両スライスに存在するため 4 本。レーン化はこの本数に触れない。
      expect(before).toBe(4);
      expect(after).toBe(before);
      mounted.handle.destroy();
    });
  });

  it('レーン化してもレイヤーの枚数は変わらない', async () => {
    const mounted = mount({ file: file({ timeline: true }) });
    await flush();
    const before = mounted.handle.getTimelineLayerState()?.layerCount;
    enableLanes(mounted.container);
    expect(mounted.handle.getTimelineLayerState()?.layerCount).toBe(before);
    mounted.handle.destroy();
  });

  it('レーン間の余白は下限へ丸められる', async () => {
    const mounted = mount({ file: file() });
    await flush();
    enableLanes(mounted.container);
    const gap = laneGapInput(mounted.container);
    gap.value = '0';
    gap.dispatchEvent(new Event('change', { bubbles: true }));
    // 0 のまま通すと隣のレーンの円が接して区切りが読めない。
    expect(laneGapInput(mounted.container).value).toBe('40');
    mounted.handle.destroy();
  });

  it('レーン化を切ると観測点は null に戻る', async () => {
    const mounted = mount({ file: file() });
    await flush();
    enableLanes(mounted.container);
    expect(mounted.handle.getClusterLaneState()).not.toBeNull();

    const toggle = laneToggle(mounted.container);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(mounted.handle.getClusterLaneState()).toBeNull();
    mounted.handle.destroy();
  });

  /**
   * レーン化を有効にしたのにクラスタが無くてレーンが 1 本もできない状態を、レーン化していない
   * 状態（null）と同じに潰さない。潰すと「チェックしたのに何も起きない」を外から区別できない。
   */
  it('レーン化を有効にしたままクラスタが消えても null にはならない', async () => {
    const mounted = mount({ file: file() });
    await flush();
    enableLanes(mounted.container);

    const stripped = file({ clusters: false });
    mounted.handle.update({ file: stripped });
    await flush();

    expect(mounted.handle.getClusterLaneState()).toEqual({
      axis: 'vertical',
      laneCount: 0,
      hasUnclustered: false,
    });
    mounted.handle.destroy();
  });
});
