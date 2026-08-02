/**
 * @jest-environment jsdom
 */
import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';
import type { CooccurrenceViewerCapabilities, CooccurrenceViewerHandle } from '../types';
import ja from '../i18n/ja.json';

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
  // 座標つきにしてキャッシュを命中させ、レイアウトの状態を `done` に固定する。
  // 保存できる条件（仕様 §4.2）を満たさないと、保存ボタンの検査が「押せない」側に寄る。
  base.layout = {
    positions: [[0, 0], [50, 0]],
    specHash: computeSpecHash(base.spec),
    algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  };
  return base;
}

interface Mounted {
  container: HTMLElement;
  handle: CooccurrenceViewerHandle;
  saved: CooccurrenceFile[];
  pngCalls: number;
}

/** ホストが渡すコールバックの有無。capability を宣言しつつ渡さないホストを再現する。 */
interface HostCallbacks {
  save?: boolean;
  png?: boolean;
}

function mount(capabilities?: CooccurrenceViewerCapabilities, callbacks: HostCallbacks = {}): Mounted {
  const { save = true, png = true } = callbacks;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const saved: CooccurrenceFile[] = [];
  let pngCalls = 0;
  const handle = mountCooccurrenceViewer(container, {
    file: file(),
    themeMode: 'light',
    locale: 'ja',
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(save ? { onRequestSave: (next: CooccurrenceFile) => saved.push(next) } : {}),
    ...(png
      ? {
          onExportPng: () => {
            pngCalls += 1;
          },
        }
      : {}),
  });
  return {
    container,
    handle,
    saved,
    get pngCalls() {
      return pngCalls;
    },
  } as Mounted;
}

/** アイコン列に並んだ操作名。図柄だけのボタンなので名前は aria-label が持つ。 */
function tabLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[role="tab"]')].map((element) => element.getAttribute('aria-label') ?? '');
}

function toolbarLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.cooc-viewer__button')].map((element) => element.textContent ?? '');
}

function exportButton(container: HTMLElement, action: 'save' | 'export-png'): HTMLButtonElement {
  return container.querySelector(`.cooc-export__button[data-action="${action}"]`) as HTMLButtonElement;
}

const BOTH: CooccurrenceViewerCapabilities = { save: true, exportPng: true };

describe('minimap and save tabs', () => {
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
    // jsdom は canvas.toBlob を持たない。無いままだと PNG ボタンの経路が例外で終わり、
    // ホストへ渡るかどうかを検査できない。
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value(callback: (blob: Blob | null) => void) {
        callback(new Blob(['png'], { type: 'image/png' }));
      },
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
    for (const id of [
      'cooccurrence-viewer-style',
      'cooccurrence-filter-panel-style',
      'cooccurrence-word-list-panel-style',
      'cooccurrence-minimap-panel-style',
      'cooccurrence-export-panel-style',
      'cooccurrence-side-rail-style',
      'cooccurrence-button-base-style',
    ]) {
      document.getElementById(id)?.remove();
    }
  });

  it('shows seven tabs when the host can save', () => {
    const { container, handle } = mount(BOTH);

    expect(tabLabels(container)).toEqual(['ミニマップ', '絞り込み', '語', '共起', 'クラスタ', '時間', '保存']);
    handle.destroy();
  });

  it('hides the save tab when the host offers neither save nor PNG', () => {
    // 空のタブは、その機能があるという誤った期待を与える（仕様 §3.5・§6.3）。
    const { container, handle } = mount({});

    expect(tabLabels(container)).toEqual(['ミニマップ', '絞り込み', '語', '共起', 'クラスタ', '時間']);
    expect(container.querySelector('#cooc-panel-export')).toBeNull();
    handle.destroy();
  });

  it('leaves only the skin toggle on top of the diagram while the layout is settled', () => {
    const { container, handle } = mount(BOTH);

    // 全体表示・保存・PNG は右パネルへ、開閉は右端のアイコン列へ移した（仕様 §3.5）。
    // 図の上のボタンは図そのものを覆うため、常設は OZ 3D のトグルだけに絞る
    // （表示モードの切替は図の見た目そのものの操作であり、パネルへ移すと図と操作が離れる。
    // OZ 風 3D 表示要件書 §2.1）。
    const labels = toolbarLabels(container);
    expect(labels).toEqual([ja.Cooccurrence['toolbar.skinOz']]);
    expect(labels).not.toContain(ja.Cooccurrence['view.fit']);
    expect(labels).not.toContain(ja.Cooccurrence['export.save']);
    expect(labels).not.toContain(ja.Cooccurrence['export.png']);
    handle.destroy();
  });

  it('saves and exports from the save tab', () => {
    const mounted = mount(BOTH);

    exportButton(mounted.container, 'save').click();
    exportButton(mounted.container, 'export-png').click();

    expect(mounted.saved).toHaveLength(1);
    // 反復を完了した計算の座標が書かれる（仕様 §4.2）。
    expect(mounted.saved[0]?.layout?.positions).toHaveLength(2);
    expect(mounted.pngCalls).toBe(1);
    mounted.handle.destroy();
  });

  it('drops the save tab when the host withdraws the capability', () => {
    const { container, handle } = mount(BOTH);
    const saveTab = container.querySelector('#cooc-panel-export-tab') as HTMLButtonElement;
    saveTab.click();

    handle.update({ capabilities: {} });

    expect(tabLabels(container)).toEqual(['ミニマップ', '絞り込み', '語', '共起', 'クラスタ', '時間']);
    // 消えたタブが選ばれたままだと、どの内容も出ない状態が残る。先頭のタブへ戻す。
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('aria-label'))
      .toBe('ミニマップ');
    expect((container.querySelector('#cooc-panel-minimap') as HTMLElement).hidden).toBe(false);
    handle.destroy();
  });

  it('hides the save button when the capability is declared without a callback', () => {
    // capability だけ true でコールバックが無いホスト。押しても無言で終わるボタンを出さない。
    // PNG 側は提供されるため、保存タブそのものは残る。
    const { container, handle } = mount(BOTH, { save: false });

    expect(tabLabels(container)).toContain('保存');
    expect(exportButton(container, 'save')).toBeNull();
    expect(exportButton(container, 'export-png')).not.toBeNull();
    // 保存できないホストで「計算が終われば保存できる」と読める案内を出さない。
    expect(container.querySelector('.cooc-export__note')?.textContent).toBe('');
    handle.destroy();
  });

  it('gives the minimap controls an accessible name', () => {
    const { container, handle } = mount(BOTH);

    const names = [...container.querySelectorAll('.cooc-minimap__button')].map((element) =>
      element.getAttribute('aria-label'),
    );
    expect(names).toEqual(['縮小', '拡大', '全体表示']);

    const canvas = container.querySelector('.cooc-minimap__canvas') as HTMLElement;
    expect(canvas.getAttribute('aria-label')).toBe('ミニマップ');
    // 操作面であることを宣言する。`img` は静止した画像を表す role であり、
    // クリック・ドラッグ・矢印キーで動かせることが支援技術に伝わらない。
    expect(canvas.getAttribute('role')).toBe('application');
    // キーボードだけの利用者が到達できること。
    expect(canvas.tabIndex).toBe(0);
    handle.destroy();
  });

  it('overlays the minimap controls on the map itself', () => {
    // 操作ボタンは全体像の上に重ねる（C4 のミニマップと同じ置き方）。全体像の下へ 1 行として
    // 並べ直すと、ボタン列がパネルの高さを取るぶん全体像が縮む。
    const { container, handle } = mount(BOTH);

    const frame = container.querySelector('.cooc-minimap__frame') as HTMLElement;
    const buttons = container.querySelector('.cooc-minimap__buttons') as HTMLElement;
    expect(buttons.parentElement).toBe(frame);
    // 重ねる先が位置の基準を持たないと、ボタンはパネルの左上へ飛ぶ。
    expect(getComputedStyle(frame).position).toBe('relative');
    expect(getComputedStyle(buttons).position).toBe('absolute');
    handle.destroy();
  });

  it('opens on the minimap tab and returns to it after switching away', () => {
    const { container, handle } = mount(BOTH);
    const shown = (id: string): boolean => !(container.querySelector(`#cooc-panel-${id}`) as HTMLElement).hidden;

    // 既定はミニマップ（仕様 §3.5）。
    expect(shown('minimap')).toBe(true);
    expect(shown('filter')).toBe(false);

    (container.querySelector('#cooc-panel-filter-tab') as HTMLButtonElement).click();
    expect(shown('filter')).toBe(true);
    expect(shown('minimap')).toBe(false);

    (container.querySelector('#cooc-panel-minimap-tab') as HTMLButtonElement).click();
    expect(shown('minimap')).toBe(true);
    expect(shown('filter')).toBe(false);
    expect(shown('words')).toBe(false);
    handle.destroy();
  });
});
