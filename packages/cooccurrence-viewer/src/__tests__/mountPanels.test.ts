/**
 * @jest-environment jsdom
 */
import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';

function file(withLayout = false): CooccurrenceFile {
  const base: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
      clusters: [
        { label: 'A', members: [0] },
        { label: 'B', members: [1] },
      ],
    },
  };
  if (withLayout) {
    base.layout = {
      positions: [[0, 0], [50, 0]],
      specHash: computeSpecHash(base.spec),
      algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
    };
  }
  return base;
}

function flush(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

describe('mountCooccurrenceViewer panel integration', () => {
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
  });

  it('does not increase layout run count when filters change', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = mountCooccurrenceViewer(container, { file: file(), themeMode: 'light' });
    await flush();
    const before = handle.getLayoutRunCount();
    const input = container.querySelector('.cooc-filter input[type="number"]') as HTMLInputElement;
    input.value = '3';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(handle.getLayoutRunCount()).toBe(before);
    expect(handle.getFilterCounts()).toEqual({ visibleNodeCount: 1, totalNodeCount: 2, visibleLinkCount: 0, totalLinkCount: 1 });
    handle.destroy();
  });

  it('increases layout run count when the file changes through editing', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = mountCooccurrenceViewer(container, { file: file(true), themeMode: 'light', onFileChange: jest.fn() });
    await flush();
    expect(handle.getLayoutRunCount()).toBe(0);
    const wordInput = container.querySelector('.cooc-words__edit input:not([type="number"])') as HTMLInputElement;
    const frequencyInput = container.querySelector('.cooc-words__edit input[type="number"]') as HTMLInputElement;
    wordInput.value = 'Gamma';
    frequencyInput.value = '1';
    const add = [...container.querySelectorAll('.cooc-words__button')].find((button) => button.textContent === 'Add');
    add?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handle.getLayoutRunCount()).toBe(1);
    handle.destroy();
  });
});
