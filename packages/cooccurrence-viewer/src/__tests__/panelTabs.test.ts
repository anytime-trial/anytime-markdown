/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
    },
  };
}

function mount(locale?: string): { container: HTMLElement; handle: ReturnType<typeof mountCooccurrenceViewer> } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCooccurrenceViewer(container, {
    file: file(),
    themeMode: 'light',
    ...(locale === undefined ? {} : { locale }),
  });
  return { container, handle };
}

function tab(container: HTMLElement, panelId: string): HTMLButtonElement {
  return container.querySelector(`[role="tab"][aria-controls="${panelId}"]`) as HTMLButtonElement;
}

function panel(container: HTMLElement, panelId: string): HTMLElement {
  return container.querySelector(`#${panelId}`) as HTMLElement;
}

describe('cooccurrence viewer panel tabs', () => {
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
      'cooccurrence-filter-panel-style',
      'cooccurrence-word-list-panel-style',
      'cooccurrence-side-rail-style',
      'cooccurrence-button-base-style',
    ]) {
      document.getElementById(id)?.remove();
    }
  });

  it('opens on the minimap tab', () => {
    // 図を開いた直後に必要なのは全体の把握である（仕様 §3.5）。
    const { container, handle } = mount();

    expect(tab(container, 'cooc-panel-minimap').getAttribute('aria-selected')).toBe('true');
    expect(panel(container, 'cooc-panel-minimap').hidden).toBe(false);
    expect(panel(container, 'cooc-panel-filter').hidden).toBe(true);
    expect(panel(container, 'cooc-panel-words').hidden).toBe(true);
    expect(panel(container, 'cooc-panel-links').hidden).toBe(true);
    handle.destroy();
  });

  it('relates each tab to its panel for assistive technology', () => {
    const { container, handle } = mount();
    const list = container.querySelector('[role="tablist"]') as HTMLElement;

    expect(list).not.toBeNull();
    for (const panelId of ['cooc-panel-filter', 'cooc-panel-words', 'cooc-panel-links']) {
      expect(tab(container, panelId).parentElement).toBe(list);
      expect(panel(container, panelId).getAttribute('role')).toBe('tabpanel');
      expect(panel(container, panelId).getAttribute('aria-labelledby')).toBe(`${panelId}-tab`);
    }
    handle.destroy();
  });

  it('switches to the words tab on click', () => {
    const { container, handle } = mount();

    tab(container, 'cooc-panel-words').click();

    expect(tab(container, 'cooc-panel-words').getAttribute('aria-selected')).toBe('true');
    expect(panel(container, 'cooc-panel-words').hidden).toBe(false);
    expect(panel(container, 'cooc-panel-filter').hidden).toBe(true);
    handle.destroy();
  });

  it('keeps the filter panel mounted so its input values survive the switch', () => {
    const { container, handle } = mount();
    const minFrequency = container.querySelector('.cooc-filter__field input') as HTMLInputElement;
    minFrequency.value = '3';
    minFrequency.dispatchEvent(new Event('input', { bubbles: true }));

    tab(container, 'cooc-panel-words').click();
    tab(container, 'cooc-panel-filter').click();

    expect((container.querySelector('.cooc-filter__field input') as HTMLInputElement).value).toBe('3');
    handle.destroy();
  });

  it('moves the selection with arrow keys', () => {
    const { container, handle } = mount();
    const minimapTab = tab(container, 'cooc-panel-minimap');
    minimapTab.focus();

    // アイコンは縦に並ぶ。並びと同じ向きのキーで移せることを固定する（仕様 §3.5）。
    minimapTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(tab(container, 'cooc-panel-filter').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(container, 'cooc-panel-filter'));
    handle.destroy();
  });

  it('collapses the panel when the selected icon is clicked again, and keeps the rail', () => {
    // 図の上に開閉ボタンを置かない代わりの経路（仕様 §3.5）。列まで消えると戻れなくなる。
    const { container, handle } = mount();
    const panels = container.querySelector('.cooc-viewer__panels') as HTMLElement;
    const rail = container.querySelector('.cooc-rail') as HTMLElement;

    tab(container, 'cooc-panel-minimap').click();

    expect(panels.hidden).toBe(true);
    expect(rail.hidden).toBe(false);
    expect(tab(container, 'cooc-panel-minimap').getAttribute('aria-selected')).toBe('false');
    // 開閉は制御される側（tabpanel）が持つ。`tab` へ置くのは現行の指針から外れる。
    expect(panel(container, 'cooc-panel-minimap').getAttribute('aria-expanded')).toBe('false');
    expect(tab(container, 'cooc-panel-minimap').hasAttribute('aria-expanded')).toBe(false);
    // 畳んでも列の停止点は残す。無くなるとキーボードからパネルへ戻れない。
    expect(tab(container, 'cooc-panel-minimap').tabIndex).toBe(0);

    tab(container, 'cooc-panel-minimap').click();

    expect(panels.hidden).toBe(false);
    expect(tab(container, 'cooc-panel-minimap').getAttribute('aria-selected')).toBe('true');
    expect(panel(container, 'cooc-panel-minimap').getAttribute('aria-expanded')).toBe('true');
    // 隠れているタブの内容は「開いていない」と読める必要がある。
    expect(panel(container, 'cooc-panel-filter').getAttribute('aria-expanded')).toBe('false');
    handle.destroy();
  });

  it('opens another tab directly while the panel is collapsed', () => {
    const { container, handle } = mount();
    const panels = container.querySelector('.cooc-viewer__panels') as HTMLElement;
    tab(container, 'cooc-panel-minimap').click();

    tab(container, 'cooc-panel-words').click();

    expect(panels.hidden).toBe(false);
    expect(panel(container, 'cooc-panel-words').hidden).toBe(false);
    expect(tab(container, 'cooc-panel-words').getAttribute('aria-selected')).toBe('true');
    handle.destroy();
  });

  it('rebuilds the word rows when the panel is reopened on the words tab', () => {
    // 畳んでいる間は列の高さが 0 で、仮想リストの可視ウィンドウが 0 行に確定しうる。
    // 開き直す側が作り直さないと、一覧が空のまま残る。
    const { container, handle } = mount();
    tab(container, 'cooc-panel-words').click();
    const items = container.querySelector('.cooc-words__items') as HTMLElement;

    tab(container, 'cooc-panel-words').click();
    items.replaceChildren();
    tab(container, 'cooc-panel-words').click();

    expect(items.querySelectorAll('[role="option"]').length).toBe(2);
    handle.destroy();
  });

  it('stands the rail to the right of the panel column', () => {
    // 画面の並びは 図 → パネル → アイコン列（仕様 §3.5）。列がパネルの内側にあると、
    // パネルを畳んだ時点でアイコンごと消える。
    const { container, handle } = mount();
    const main = container.querySelector('.cooc-viewer__main') as HTMLElement;
    const rail = container.querySelector('.cooc-rail') as HTMLElement;

    expect(rail.parentElement).toBe(main);
    expect([...main.children].indexOf(rail)).toBe(main.children.length - 1);
    expect(rail.getAttribute('aria-orientation')).toBe('vertical');
    handle.destroy();
  });

  it('uses roving tabindex so the panel has a single tab stop', () => {
    const { container, handle } = mount();

    expect(tab(container, 'cooc-panel-minimap').tabIndex).toBe(0);
    expect(tab(container, 'cooc-panel-filter').tabIndex).toBe(-1);
    expect(tab(container, 'cooc-panel-words').tabIndex).toBe(-1);
    handle.destroy();
  });

  it('records the selection while the active tab stays put and fills the form after switching', () => {
    const { container, handle } = mount();
    // 図の中の語をクリックした場合と同じ経路（selectedNodeIndex の更新 → updatePanels）を、
    // jsdom で座標を組めない canvas の代わりに一覧の行クリックで起こす。
    const row = container.querySelector('[role="option"][data-node-index="1"]') as HTMLButtonElement;
    row.click();

    // 選択が起きてもタブは奪われない（仕様 §3.5）。既定はミニマップタブ。
    expect(tab(container, 'cooc-panel-minimap').getAttribute('aria-selected')).toBe('true');

    tab(container, 'cooc-panel-words').click();

    // 切り替えた時点で、選んだ語が編集フォームに入っている（E2E §8 No.6）。
    const inputs = container.querySelectorAll('.cooc-words__edit input');
    expect((inputs[0] as HTMLInputElement).value).toBe('Beta');
    expect((inputs[1] as HTMLInputElement).value).toBe('2');
    handle.destroy();
  });

  it('keeps focus on the tab bar when the host changes the locale', () => {
    const { container, handle } = mount('ja');
    const filterTab = tab(container, 'cooc-panel-filter');
    filterTab.focus();

    // タブ列は update() で作り直されるため、戻さないとフォーカスが body へ落ちる。
    // 矢印キー経路はハンドラ自身が focus() を張り直すので、この復帰が効くのはホスト起点の
    // 更新（言語切替など）のときだけである。
    handle.update({ locale: 'en' });

    expect(document.activeElement).toBe(tab(container, 'cooc-panel-filter'));
    handle.destroy();
  });

  it('does not steal the active tab when the canvas changes the selection', () => {
    const { container, handle } = mount();
    const canvas = container.querySelector('.cooc-viewer__canvas') as HTMLCanvasElement;

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(tab(container, 'cooc-panel-minimap').getAttribute('aria-selected')).toBe('true');
    expect(panel(container, 'cooc-panel-words').hidden).toBe(true);
    expect(panel(container, 'cooc-panel-links').hidden).toBe(true);
    handle.destroy();
  });

  it('keeps the active tab across hiding and showing the panel', () => {
    const { container, handle } = mount();
    tab(container, 'cooc-panel-words').click();

    handle.update({ showPanels: false });
    handle.update({ showPanels: true });

    expect(tab(container, 'cooc-panel-words').getAttribute('aria-selected')).toBe('true');
    expect(panel(container, 'cooc-panel-words').hidden).toBe(false);
    handle.destroy();
  });

  it('rebuilds the word rows when the words tab becomes visible', () => {
    const { container, handle } = mount();
    const items = container.querySelector('.cooc-words__items') as HTMLElement;
    // 隠れている間は viewport の clientHeight が 0 で、仮想ウィンドウが 0 行に確定しうる。
    // 表示へ戻す側が作り直さないと、一覧が空のまま残る。
    items.replaceChildren();

    tab(container, 'cooc-panel-words').click();

    expect(items.querySelectorAll('[role="option"]').length).toBe(2);
    handle.destroy();
  });

  it('translates the icon names when the locale changes', () => {
    // 図柄だけのボタンは、名前を持たないと支援技術から「ボタン」としか読めない。
    const { container, handle } = mount('ja');

    expect(tab(container, 'cooc-panel-filter').getAttribute('aria-label')).toBe('絞り込み');
    expect(tab(container, 'cooc-panel-words').getAttribute('aria-label')).toBe('語');
    expect(tab(container, 'cooc-panel-links').getAttribute('aria-label')).toBe('共起');
    expect(tab(container, 'cooc-panel-minimap').getAttribute('aria-label')).toBe('ミニマップ');
    expect(tab(container, 'cooc-panel-minimap').title).toBe('ミニマップ');
    expect((container.querySelector('.cooc-rail') as HTMLElement).getAttribute('aria-label'))
      .toBe('パネルの切り替え');

    handle.update({ locale: 'en' });

    expect(tab(container, 'cooc-panel-filter').getAttribute('aria-label')).toBe('Filter');
    expect(tab(container, 'cooc-panel-words').getAttribute('aria-label')).toBe('Terms');
    expect(tab(container, 'cooc-panel-links').getAttribute('aria-label')).toBe('Cooccurrences');
    expect(tab(container, 'cooc-panel-minimap').getAttribute('aria-label')).toBe('Minimap');
    expect((container.querySelector('.cooc-rail') as HTMLElement).getAttribute('aria-label'))
      .toBe('Panel switcher');
    handle.destroy();
  });

  it('carries an icon on every rail button', () => {
    // 図柄が抜けても aria-label は残るため、視覚的には空のボタンが並ぶだけで検知できない。
    const { container, handle } = mount();

    for (const panelId of ['cooc-panel-minimap', 'cooc-panel-filter', 'cooc-panel-words', 'cooc-panel-links']) {
      const icon = tab(container, panelId).querySelector('svg');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(icon?.querySelector('path')?.getAttribute('d')?.length ?? 0).toBeGreaterThan(10);
    }
    handle.destroy();
  });
});
