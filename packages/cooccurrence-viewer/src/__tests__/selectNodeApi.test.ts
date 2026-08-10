/**
 * @jest-environment jsdom
 */
import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';

/**
 * ホストからの選択指定 API（機能仕様書 §6.4.1）。trail-viewer 知識グラフタブが
 * 引用・エージェント照会から「この語を見よ」を指定するために使う。
 */
function fixtureFile(): CooccurrenceFile {
  const base: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-08-10T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
        { label: 'Gamma', frequency: 1 },
      ],
      links: [[0, 1, 4]],
      clusters: [{ label: 'A', members: [0, 1] }],
    },
  };
  base.layout = {
    positions: [[0, 0], [50, 0], [200, 0]],
    specHash: computeSpecHash(base.spec),
    algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  };
  return base;
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCooccurrenceViewer(container, {
    file: fixtureFile(),
    themeMode: 'light',
    locale: 'ja',
  });
  return { container, handle };
}

describe('CooccurrenceViewerHandle.selectNode', () => {
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

  it('指定した添字を選択状態にする', () => {
    const { handle, container } = mount();
    handle.selectNode(1);
    expect(handle.getSelectedNodeIndex()).toBe(1);
    handle.destroy();
    container.remove();
  });

  it('トグルではない: 同じ添字を再指定しても解除されない', () => {
    const { handle, container } = mount();
    handle.selectNode(1);
    handle.selectNode(1);
    expect(handle.getSelectedNodeIndex()).toBe(1);
    handle.destroy();
    container.remove();
  });

  it('null で解除する', () => {
    const { handle, container } = mount();
    handle.selectNode(2);
    handle.selectNode(null);
    expect(handle.getSelectedNodeIndex()).toBeNull();
    handle.destroy();
    container.remove();
  });

  it('範囲外・非整数の添字は無視して現在の選択を保つ', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { handle, container } = mount();
    handle.selectNode(1);
    handle.selectNode(99);
    expect(handle.getSelectedNodeIndex()).toBe(1);
    handle.selectNode(-1);
    expect(handle.getSelectedNodeIndex()).toBe(1);
    handle.selectNode(0.5);
    expect(handle.getSelectedNodeIndex()).toBe(1);
    expect(warn).toHaveBeenCalled();
    handle.destroy();
    container.remove();
    warn.mockRestore();
  });
});
