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
      // 座標キャッシュを持たせない。レイアウトが走る経路と走らない経路の両方で、パネルが
      // 更新されることを見る。
    },
  };
}

function mount(): { container: HTMLElement; handle: ReturnType<typeof mountCooccurrenceViewer> } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCooccurrenceViewer(container, { file: file(), themeMode: 'light', locale: 'ja' });
  enterEditMode(container);
  return { container, handle };
}

/**
 * 編集モードへ入る。既定は閲覧専用のため、書き換えの検査は必ずここを通る（要件書 §2.1）。
 */
function enterEditMode(container: HTMLElement): void {
  (container.querySelector('[data-edit-mode-toggle="true"]') as HTMLButtonElement).click();
}

function tab(container: HTMLElement, panelId: string): HTMLButtonElement {
  return container.querySelector(`[role="tab"][aria-controls="${panelId}"]`) as HTMLButtonElement;
}

function rows(container: HTMLElement, panelId: string): string[] {
  return [...container.querySelectorAll(`#${panelId} [role="option"]`)].map((row) => row.textContent ?? '');
}

describe('編集後のパネル更新', () => {
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
      'cooccurrence-link-list-panel-style',
      'cooccurrence-side-rail-style',
      'cooccurrence-minimap-panel-style',
      'cooccurrence-export-panel-style',
      'cooccurrence-button-base-style',
    ]) {
      document.getElementById(id)?.remove();
    }
  });

  // 向きは座標に影響しないため、変更してもレイアウトは走らない（設計書 §2.4）。レイアウト完了を
  // 契機にしかパネルを描き直さない実装だと、この経路だけ一覧が古いまま固まる。
  it('共起の向きを変えると一覧の記号が変わる', () => {
    const { container, handle } = mount();
    tab(container, 'cooc-panel-links').click();

    expect(rows(container, 'cooc-panel-links')[0]).toContain('—');

    (container.querySelector('#cooc-panel-links [role="option"]') as HTMLButtonElement).click();
    const direction = container.querySelector('#cooc-panel-links [data-field="direction"]') as HTMLSelectElement;
    direction.value = '3';
    (container.querySelector('#cooc-panel-links [data-action="update"]') as HTMLButtonElement).click();

    expect(rows(container, 'cooc-panel-links')[0]).toContain('↔');
    handle.destroy();
  });

  it('語を追加すると語の一覧に現れる', () => {
    const { container, handle } = mount();
    tab(container, 'cooc-panel-words').click();

    expect(rows(container, 'cooc-panel-words')).toHaveLength(2);

    const inputs = container.querySelectorAll<HTMLInputElement>('#cooc-panel-words .cooc-words__edit input');
    inputs[0].value = 'Gamma';
    inputs[1].value = '5';
    const addButton = [...container.querySelectorAll<HTMLButtonElement>('#cooc-panel-words button')].find(
      (button) => button.textContent === '追加',
    );
    addButton?.click();

    expect(rows(container, 'cooc-panel-words')).toHaveLength(3);
    handle.destroy();
  });
});
