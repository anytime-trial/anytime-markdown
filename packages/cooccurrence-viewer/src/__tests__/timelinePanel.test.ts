/**
 * @jest-environment jsdom
 */
import {
  BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  computeSpecHash,
  readCooccurrenceSliceValue,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';
import type { CooccurrenceViewerHandle } from '../types';

function file(): CooccurrenceFile {
  const base: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
    },
  };
  base.layout = {
    positions: [
      [0, 0],
      [50, 0],
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
  latest(): CooccurrenceFile;
}

function mount(): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let latest = file();
  const handle = mountCooccurrenceViewer(container, {
    file: latest,
    themeMode: 'light',
    onFileChange(next) {
      latest = next;
    },
  });
  return { container, handle, latest: () => latest };
}

function openTimelineTab(container: HTMLElement): void {
  const tab = container.querySelector('#cooc-panel-timeline-tab') as HTMLButtonElement;
  tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function timelineInputs(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll('.cooc-timeline__add input')] as HTMLInputElement[];
}

function addSlice(container: HTMLElement, label: string, at = ''): void {
  const [labelInput, atInput] = timelineInputs(container);
  labelInput.value = label;
  atInput.value = at;
  const button = container.querySelector('.cooc-timeline__add button') as HTMLButtonElement;
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('時間タブ', () => {
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
      'cooccurrence-timeline-panel-style',
      'cooccurrence-slice-value-editor-style',
      'cooccurrence-button-base-style',
    ]) {
      document.getElementById(id)?.remove();
    }
  });

  it('アイコン列に時間のタブが出る', async () => {
    const mounted = mount();
    await flush();
    expect(mounted.container.querySelector('#cooc-panel-timeline-tab')).not.toBeNull();
    mounted.handle.destroy();
  });

  it('最初のスライスを足すと、現在の値が引き継がれる', async () => {
    const mounted = mount();
    await flush();
    openTimelineTab(mounted.container);
    addSlice(mounted.container, '1月', '2026-01-01');

    const spec = mounted.latest().spec;
    expect(spec.timeline?.slices).toEqual([{ label: '1月', at: '2026-01-01' }]);
    expect(readCooccurrenceSliceValue(spec, { target: 'nodes', slice: 0, index: 0 })).toBe(3);
    expect(readCooccurrenceSliceValue(spec, { target: 'links', slice: 0, index: 0 })).toBe(4);
    // 全体値は据え置き。時間軸を足しただけで値が失われない。
    expect(spec.nodes.map((node) => node.frequency)).toEqual([3, 2]);
    mounted.handle.destroy();
  });

  it('スライスを足してもレイアウトは再計算しない（時間軸は座標の入力ではない）', async () => {
    const mounted = mount();
    await flush();
    const before = mounted.handle.getLayoutRunCount();
    openTimelineTab(mounted.container);
    addSlice(mounted.container, '1月');
    addSlice(mounted.container, '2月');
    expect(mounted.handle.getLayoutRunCount()).toBe(before);
    mounted.handle.destroy();
  });

  it('スライスが 2 枚あるとレイヤー表示になり、点線の本数を観測できる', async () => {
    const mounted = mount();
    await flush();
    openTimelineTab(mounted.container);
    addSlice(mounted.container, '1月');
    addSlice(mounted.container, '2月');

    const layerState = mounted.handle.getTimelineLayerState();
    expect(layerState?.axis).toBe('horizontal');
    expect(layerState?.layerCount).toBe(2);
    // 2 枚目のスライスは空で始まるため、両方に存在する語は無い。
    expect(layerState?.timeLinkCount).toBe(0);
    mounted.handle.destroy();
  });

  it('レイヤー表示を切ると単一表示へ戻る', async () => {
    const mounted = mount();
    await flush();
    openTimelineTab(mounted.container);
    addSlice(mounted.container, '1月');

    const toggle = mounted.container.querySelector('.cooc-timeline__row input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(mounted.handle.getTimelineLayerState()).toBeNull();
    mounted.handle.destroy();
  });

  it('時間軸を持たない図ではレイヤー表示の操作を触れなくする', async () => {
    const mounted = mount();
    await flush();
    openTimelineTab(mounted.container);
    const toggle = mounted.container.querySelector('.cooc-timeline__row input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(mounted.handle.getTimelineLayerState()).toBeNull();
    mounted.handle.destroy();
  });

  it('スライスがあると絞り込みタブに表示するスライスの選択が出る', async () => {
    const mounted = mount();
    await flush();
    openTimelineTab(mounted.container);
    addSlice(mounted.container, '1月');
    addSlice(mounted.container, '2月');

    const slices = mounted.container.querySelector('.cooc-filter__slices') as HTMLElement;
    expect(slices.hidden).toBe(false);
    const checkboxes = [...slices.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((checkbox) => checkbox.checked)).toBe(true);

    checkboxes[1].checked = false;
    checkboxes[1].dispatchEvent(new Event('change', { bubbles: true }));
    expect(mounted.handle.getTimelineLayerState()?.layerCount).toBe(1);
    mounted.handle.destroy();
  });

  it('語タブにスライス別の頻度が出て、全体値の直接編集は触れなくなる', async () => {
    const mounted = mount();
    await flush();
    openTimelineTab(mounted.container);
    addSlice(mounted.container, '1月');

    const wordsTab = mounted.container.querySelector('#cooc-panel-words-tab') as HTMLButtonElement;
    wordsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const sliceInputs = [
      ...mounted.container.querySelectorAll('#cooc-panel-words .cooc-slice-values__row input'),
    ] as HTMLInputElement[];
    expect(sliceInputs).toHaveLength(1);
    const frequencyInput = mounted.container.querySelector(
      '.cooc-words__edit input[type="number"]',
    ) as HTMLInputElement;
    expect(frequencyInput.disabled).toBe(true);
    mounted.handle.destroy();
  });

  it('レイヤーの円に触れると、そのスライスの値と全期間の値を出し分ける', async () => {
    const mounted = mount();
    await flush();
    openTimelineTab(mounted.container);
    addSlice(mounted.container, '1月');
    addSlice(mounted.container, '2月');

    const canvas = mounted.container.querySelector('.cooc-viewer__canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 }) as DOMRect;
    // 1 月のレイヤーの語 Alpha は座標 (0,0)。視野は全体表示のままなので、円の中心を狙う。
    canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0 }));
    const popup = mounted.handle.getNotePopupState();
    expect(popup?.kind).toBe('node');
    // レイヤー表示では 4 行（スライス名・そのスライスの頻度・そのレイヤーの共起数・全期間の頻度）。
    // 単一表示の 2 行と数で見分ける。文言はロケールで変わるため、行数と対象名で固定する。
    expect(popup?.details).toHaveLength(4);
    expect(popup?.details[0]).toContain('1月');
    mounted.handle.destroy();
  });

  it('単一表示では全期間の値だけを出す', async () => {
    const mounted = mount();
    await flush();
    const canvas = mounted.container.querySelector('.cooc-viewer__canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 }) as DOMRect;
    canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0 }));
    const popup = mounted.handle.getNotePopupState();
    expect(popup?.details).toHaveLength(2);
    mounted.handle.destroy();
  });

  it('スライスを 1 枚も持たない図ではスライス別の入力欄を出さない', async () => {
    const mounted = mount();
    await flush();
    const editor = mounted.container.querySelector('#cooc-panel-words .cooc-slice-values') as HTMLElement;
    expect(editor.hidden).toBe(true);
    mounted.handle.destroy();
  });
});

describe('スライスの増減と表示するスライスの選択', () => {
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
      'cooccurrence-timeline-panel-style',
      'cooccurrence-slice-value-editor-style',
      'cooccurrence-button-base-style',
    ]) {
      document.getElementById(id)?.remove();
    }
  });

  function sliceCheckboxes(container: HTMLElement): HTMLInputElement[] {
    return [...container.querySelectorAll('.cooc-filter__slices input[type="checkbox"]')] as HTMLInputElement[];
  }

  function uncheck(container: HTMLElement, position: number): void {
    const checkbox = sliceCheckboxes(container)[position];
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** ラベルで行を引いて「後ろへ移動」を押す。押すたびに行は組み直されるため、毎回引き直す。 */
  function moveDown(container: HTMLElement, label: string): void {
    const rows = [...container.querySelectorAll('.cooc-timeline__slice')];
    const row = rows.find((entry) => (entry.querySelector('input') as HTMLInputElement | null)?.value === label);
    if (row === undefined) throw new Error(`slice row not found: ${label}`);
    const buttons = [...row.querySelectorAll('button')] as HTMLButtonElement[];
    buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  /** ラベルで行を引いて「このスライスを削除」を押す。 */
  function removeSlice(container: HTMLElement, label: string): void {
    const rows = [...container.querySelectorAll('.cooc-timeline__slice')];
    const row = rows.find((entry) => (entry.querySelector('input') as HTMLInputElement | null)?.value === label);
    if (row === undefined) throw new Error(`slice row not found: ${label}`);
    const buttons = [...row.querySelectorAll('button')] as HTMLButtonElement[];
    buttons[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function threeSlices(): Mounted {
    const mounted = mount();
    openTimelineTab(mounted.container);
    addSlice(mounted.container, '1月');
    addSlice(mounted.container, '2月');
    addSlice(mounted.container, '3月');
    return mounted;
  }

  /** 今どのスライスが描かれているかを、レイヤー名から読む。 */
  function shownLabels(mounted: Mounted): string[] {
    const slices = mounted.latest().spec.timeline?.slices ?? [];
    const selected = sliceCheckboxes(mounted.container)
      .map((checkbox, index) => (checkbox.checked ? slices[index]?.label : undefined))
      .filter((label): label is string => label !== undefined);
    return selected;
  }

  it('スライスを消しても、外したスライスの選択がずれない', async () => {
    const mounted = threeSlices();
    await flush();
    // 3 月を外す（1 月と 2 月だけを描く）。
    uncheck(mounted.container, 2);
    expect(shownLabels(mounted)).toEqual(['1月', '2月']);

    // 1 月を削除する。選択を添字（0・1）で持っていると、残った 2 枚がそのまま添字 0・1 になり、
    // 利用者が外したはずの 3 月が黙って描かれる。
    removeSlice(mounted.container, '1月');

    expect(mounted.latest().spec.timeline?.slices.map((slice) => slice.label)).toEqual(['2月', '3月']);
    expect(shownLabels(mounted)).toEqual(['2月']);
    expect(mounted.handle.getTimelineLayerState()?.layerCount).toBe(1);
    mounted.handle.destroy();
  });

  it('スライスを並べ替えても、外したスライスの選択がずれない', async () => {
    const mounted = threeSlices();
    await flush();
    uncheck(mounted.container, 0);

    // 1 月を末尾へ 2 回動かす（1月・2月・3月 → 2月・3月・1月）。行はラベルで引き直す。
    moveDown(mounted.container, '1月');
    moveDown(mounted.container, '1月');

    expect(mounted.latest().spec.timeline?.slices.map((slice) => slice.label)).toEqual(['2月', '3月', '1月']);
    expect(shownLabels(mounted)).toEqual(['2月', '3月']);
    mounted.handle.destroy();
  });
});
