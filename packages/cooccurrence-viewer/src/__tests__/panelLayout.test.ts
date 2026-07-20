/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
    },
  };
}

function mount(): { container: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCooccurrenceViewer(container, { file: file(), themeMode: 'light' });
  return { container, destroy: () => handle.destroy() };
}

describe('cooccurrence viewer panel layout', () => {
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
    document.getElementById('cooccurrence-viewer-style')?.remove();
    document.getElementById('cooccurrence-filter-panel-style')?.remove();
    document.getElementById('cooccurrence-word-list-panel-style')?.remove();
  });

  it('scrolls the panel column instead of clipping its lower controls', () => {
    const { container, destroy } = mount();
    const panels = container.querySelector('.cooc-viewer__panels') as HTMLElement;

    // ガード: このアサーションが落ちるなら jsdom がスタイルシートを解決できていない。
    // 下の overflowY 検査が「常に visible」で fail-open するのを防ぐ。
    expect(getComputedStyle(panels).width).toBe('300px');

    expect(getComputedStyle(panels).overflowY).toBe('auto');
    destroy();
  });

  it('keeps the filter section from being squeezed out of the panel column', () => {
    const { container, destroy } = mount();
    const filter = container.querySelector('.cooc-filter') as HTMLElement;

    expect(getComputedStyle(filter).flexShrink).toBe('0');
    destroy();
  });

  it('keeps the word list from collapsing so its editing controls stay reachable', () => {
    const { container, destroy } = mount();
    const words = container.querySelector('.cooc-words') as HTMLElement;

    expect(getComputedStyle(words).flexShrink).toBe('0');
    // basis:auto が content 高さでパネル列を押し出し、外側のスクロールを成立させる。
    // 0% に戻すと語一覧が縮んで編集入力・ボタン群が再び到達不能になる。
    expect(getComputedStyle(words).flexBasis).toBe('auto');
    destroy();
  });

  it('renders the toolbar and status inside the stage so they never cover the panel column', () => {
    const { container, destroy } = mount();
    const stage = container.querySelector('.cooc-viewer__stage') as HTMLElement;
    const toolbar = container.querySelector('.cooc-viewer__toolbar') as HTMLElement;
    const status = container.querySelector('.cooc-viewer__status') as HTMLElement;

    expect(toolbar.parentElement).toBe(stage);
    expect(status.parentElement).toBe(stage);
    destroy();
  });
});
