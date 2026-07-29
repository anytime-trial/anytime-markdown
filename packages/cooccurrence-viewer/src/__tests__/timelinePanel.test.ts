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

  it('スライスを 1 枚も持たない図ではスライス別の入力欄を出さない', async () => {
    const mounted = mount();
    await flush();
    const editor = mounted.container.querySelector('#cooc-panel-words .cooc-slice-values') as HTMLElement;
    expect(editor.hidden).toBe(true);
    mounted.handle.destroy();
  });
});
