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
      'cooccurrence-tab-bar-style',
      'cooccurrence-button-base-style',
    ]) {
      document.getElementById(id)?.remove();
    }
  });

  it('opens on the filter tab', () => {
    const { container, handle } = mount();

    expect(tab(container, 'cooc-panel-filter').getAttribute('aria-selected')).toBe('true');
    expect(panel(container, 'cooc-panel-filter').hidden).toBe(false);
    expect(panel(container, 'cooc-panel-edit').hidden).toBe(true);
    handle.destroy();
  });

  it('relates each tab to its panel for assistive technology', () => {
    const { container, handle } = mount();
    const list = container.querySelector('[role="tablist"]') as HTMLElement;

    expect(list).not.toBeNull();
    for (const panelId of ['cooc-panel-filter', 'cooc-panel-edit']) {
      expect(tab(container, panelId).parentElement).toBe(list);
      expect(panel(container, panelId).getAttribute('role')).toBe('tabpanel');
      expect(panel(container, panelId).getAttribute('aria-labelledby')).toBe(`${panelId}-tab`);
    }
    handle.destroy();
  });

  it('switches to the edit tab on click', () => {
    const { container, handle } = mount();

    tab(container, 'cooc-panel-edit').click();

    expect(tab(container, 'cooc-panel-edit').getAttribute('aria-selected')).toBe('true');
    expect(panel(container, 'cooc-panel-edit').hidden).toBe(false);
    expect(panel(container, 'cooc-panel-filter').hidden).toBe(true);
    handle.destroy();
  });

  it('keeps the filter panel mounted so its input values survive the switch', () => {
    const { container, handle } = mount();
    const minFrequency = container.querySelector('.cooc-filter__field input') as HTMLInputElement;
    minFrequency.value = '7';
    minFrequency.dispatchEvent(new Event('input', { bubbles: true }));

    tab(container, 'cooc-panel-edit').click();
    tab(container, 'cooc-panel-filter').click();

    expect((container.querySelector('.cooc-filter__field input') as HTMLInputElement).value).toBe('7');
    handle.destroy();
  });

  it('moves the selection with arrow keys', () => {
    const { container, handle } = mount();
    const filterTab = tab(container, 'cooc-panel-filter');
    filterTab.focus();

    filterTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(tab(container, 'cooc-panel-edit').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(container, 'cooc-panel-edit'));
    handle.destroy();
  });

  it('uses roving tabindex so the panel has a single tab stop', () => {
    const { container, handle } = mount();

    expect(tab(container, 'cooc-panel-filter').tabIndex).toBe(0);
    expect(tab(container, 'cooc-panel-edit').tabIndex).toBe(-1);
    handle.destroy();
  });

  it('does not steal the active tab when the canvas changes the selection', () => {
    const { container, handle } = mount();
    const canvas = container.querySelector('.cooc-viewer__canvas') as HTMLCanvasElement;

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(tab(container, 'cooc-panel-filter').getAttribute('aria-selected')).toBe('true');
    expect(panel(container, 'cooc-panel-edit').hidden).toBe(true);
    handle.destroy();
  });

  it('keeps the active tab across hiding and showing the panel', () => {
    const { container, handle } = mount();
    tab(container, 'cooc-panel-edit').click();

    handle.update({ showPanels: false });
    handle.update({ showPanels: true });

    expect(tab(container, 'cooc-panel-edit').getAttribute('aria-selected')).toBe('true');
    expect(panel(container, 'cooc-panel-edit').hidden).toBe(false);
    handle.destroy();
  });

  it('rebuilds the word rows when the edit tab becomes visible', () => {
    const { container, handle } = mount();
    const items = container.querySelector('.cooc-words__items') as HTMLElement;
    // 隠れている間は viewport の clientHeight が 0 で、仮想ウィンドウが 0 行に確定しうる。
    // 表示へ戻す側が作り直さないと、一覧が空のまま残る。
    items.replaceChildren();

    tab(container, 'cooc-panel-edit').click();

    expect(items.querySelectorAll('[role="option"]').length).toBe(2);
    handle.destroy();
  });

  it('translates the tab labels when the locale changes', () => {
    const { container, handle } = mount('ja');

    expect(tab(container, 'cooc-panel-filter').textContent).toBe('絞り込み');
    expect(tab(container, 'cooc-panel-edit').textContent).toBe('要素の編集');

    handle.update({ locale: 'en' });

    expect(tab(container, 'cooc-panel-filter').textContent).toBe('Filter');
    expect(tab(container, 'cooc-panel-edit').textContent).toBe('Edit elements');
    handle.destroy();
  });
});
