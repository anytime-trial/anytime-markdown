/**
 * @jest-environment jsdom
 */
import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';
import { createOzRenderer, type OzRenderer } from '../scene3d/ozRenderer';
import type { OzSceneModel } from '../scene3d/sceneModel';
import type { CooccurrenceViewerOptions } from '../types';

jest.mock('../scene3d/ozRenderer', () => ({ createOzRenderer: jest.fn() }));

const createOzRendererMock = createOzRenderer as jest.MockedFunction<typeof createOzRenderer>;

interface FakeOzRenderer extends OzRenderer {
  setModel: jest.Mock;
  setThemeMode: jest.Mock;
  setAnimating: jest.Mock;
  fitView: jest.Mock;
  exportPng: jest.Mock;
  dispose: jest.Mock;
}

function fakeRenderer(): FakeOzRenderer {
  return {
    setModel: jest.fn(),
    setThemeMode: jest.fn(),
    setAnimating: jest.fn(),
    fitView: jest.fn(),
    exportPng: jest.fn().mockResolvedValue(null),
    dispose: jest.fn(),
  };
}

function fixtureFile(): CooccurrenceFile {
  const base: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-07-30T00:00:00.000Z', origin: 'manual' },
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
  base.layout = {
    positions: [[0, 0], [50, 0]],
    specHash: computeSpecHash(base.spec),
    algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  };
  return base;
}

function flush(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

function mount(over: Partial<CooccurrenceViewerOptions> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCooccurrenceViewer(container, { file: fixtureFile(), themeMode: 'light', ...over });
  const root = container.querySelector('.cooc-viewer') as HTMLElement;
  return { container, handle, root };
}

function skinToggle(root: HTMLElement): HTMLButtonElement {
  const button = root.querySelector('.cooc-viewer__toolbar button[aria-pressed]');
  if (!(button instanceof HTMLButtonElement)) throw new Error('skin toggle not found');
  return button;
}

function coocBg(root: HTMLElement): string {
  return root.style.getPropertyValue('--cooc-bg');
}

describe('OZ スキンのトグルと配線', () => {
  let fake: FakeOzRenderer;

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
    fake = fakeRenderer();
    createOzRendererMock.mockReset().mockImplementation(() => fake);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('初期状態は standard で、3D レンダラは生成されない', async () => {
    const { root } = mount();
    await flush();
    expect(skinToggle(root).getAttribute('aria-pressed')).toBe('false');
    expect(createOzRendererMock).not.toHaveBeenCalled();
    expect(coocBg(root)).toBe('#F2EFE8');
  });

  it('トグルで OZ へ切り替わり、canvas が隠れてシーンモデルが渡る', async () => {
    const { root } = mount();
    await flush();
    skinToggle(root).click();
    expect(createOzRendererMock).toHaveBeenCalledTimes(1);
    expect(coocBg(root)).toBe('#F4F5FB');
    expect(skinToggle(root).getAttribute('aria-pressed')).toBe('true');
    const canvas = root.querySelector('.cooc-viewer__canvas') as HTMLElement;
    expect(canvas.style.display).toBe('none');
    expect(fake.setModel).toHaveBeenCalled();
    const model = fake.setModel.mock.calls.at(-1)?.[0] as OzSceneModel;
    expect(model.nodes).toHaveLength(2);
    // ノード色はキャンディパレット（--cooc-cluster-* の焼き込み）
    expect(model.nodes.map((node) => node.color)).toEqual(expect.arrayContaining(['#FF6B6B', '#FFB3B3']));
    // クラスタ見出しがファイルのクラスタ label から渡る（v2）
    expect(model.headings.map((heading) => heading.text)).toEqual(['A', 'B']);
    // 流れアニメーションが有効化される（v2）
    expect(fake.setAnimating).toHaveBeenLastCalledWith(true);
  });

  it('再トグルで standard へ戻る', async () => {
    const { root } = mount();
    await flush();
    skinToggle(root).click();
    skinToggle(root).click();
    expect(coocBg(root)).toBe('#F2EFE8');
    expect(fake.setAnimating).toHaveBeenLastCalledWith(false);
    const canvas = root.querySelector('.cooc-viewer__canvas') as HTMLElement;
    expect(canvas.style.display).toBe('');
    const oz = root.querySelector('.cooc-viewer__oz') as HTMLElement;
    expect(oz.style.display).toBe('none');
  });

  it('update({skin}) と themeMode 変更が OZ に追従する', async () => {
    const { root, handle } = mount();
    await flush();
    handle.update({ skin: 'oz' });
    expect(coocBg(root)).toBe('#F4F5FB');
    handle.update({ themeMode: 'dark' });
    expect(coocBg(root)).toBe('#0A0F2E');
    expect(fake.setThemeMode).toHaveBeenCalledWith('dark');
  });

  it('絞り込みの更新で 3D シーンが再送される', async () => {
    const { root, handle } = mount();
    await flush();
    skinToggle(root).click();
    const before = fake.setModel.mock.calls.length;
    handle.update({ filter: { minFrequency: 2 } });
    expect(fake.setModel.mock.calls.length).toBeGreaterThan(before);
  });

  it('3D の選択がシーンとパネルへ反映される', async () => {
    const { root } = mount();
    await flush();
    skinToggle(root).click();
    const rendererOptions = createOzRendererMock.mock.calls[0][0];
    rendererOptions.onSelect(0);
    const model = fake.setModel.mock.calls.at(-1)?.[0] as OzSceneModel;
    // v2: 選択語はピルとして描かれ、語テキストをモデルが持つ
    const selected = model.nodes.find((node) => node.index === 0);
    expect(selected?.pill).toBe(true);
    expect(selected?.label).toBe('Alpha');
  });

  it('語一覧の行クリック選択が 3D シーンへ即時反映される', async () => {
    // 語 2 は孤立させ、語 0 の選択で近傍外の淡色化（0.18）が観測できる形にする。
    const file: CooccurrenceFile = {
      meta: { schemaVersion: 1, generatedAt: '2026-07-30T00:00:00.000Z', origin: 'manual' },
      spec: {
        nodes: [
          { label: 'Alpha', frequency: 3 },
          { label: 'Beta', frequency: 2 },
          { label: 'Gamma', frequency: 1 },
        ],
        links: [[0, 1, 4]],
      },
    };
    file.layout = {
      positions: [[0, 0], [50, 0], [200, 0]],
      specHash: computeSpecHash(file.spec),
      algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
    };
    const { root } = mount({ file });
    await flush();
    skinToggle(root).click();
    const before = fake.setModel.mock.calls.length;
    const row = root.querySelector('.cooc-words__row[data-node-index="0"]');
    if (!(row instanceof HTMLButtonElement)) throw new Error('word row not found');
    row.click();
    expect(fake.setModel.mock.calls.length).toBeGreaterThan(before);
    const model = fake.setModel.mock.calls.at(-1)?.[0] as OzSceneModel;
    const byIndex = new Map(model.nodes.map((node) => [node.index, node]));
    expect(byIndex.get(0)?.alpha).toBe(1);
    expect(byIndex.get(2)?.alpha).toBe(0.18);
    // もう一度クリックすると選択解除（2D と同じトグル規則）が 3D へも届く。
    row.click();
    const cleared = fake.setModel.mock.calls.at(-1)?.[0] as OzSceneModel;
    expect(cleared.nodes.every((node) => node.alpha === 1)).toBe(true);
  });

  it('WebGL 初期化失敗時は standard のまま通知を出す', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    createOzRendererMock.mockImplementation(() => {
      throw new Error('no webgl');
    });
    const { root } = mount({ locale: 'ja' });
    await flush();
    skinToggle(root).click();
    expect(coocBg(root)).toBe('#F2EFE8');
    expect(skinToggle(root).getAttribute('aria-pressed')).toBe('false');
    const notice = root.querySelector('.cooc-viewer__notice');
    expect(notice?.textContent).toBe('WebGL を初期化できないため 2D 表示を継続します');
    expect(warn).toHaveBeenCalled();
  });

  it('OZ 中はミニマップタブが無効になり、選択中なら別タブへ退避する', async () => {
    const { root } = mount({ locale: 'ja' });
    await flush();
    const minimapTab = () => root.querySelector('button[aria-controls$="minimap"]') as HTMLButtonElement;
    expect(minimapTab().disabled).toBe(false);
    skinToggle(root).click();
    expect(minimapTab().disabled).toBe(true);
    expect(minimapTab().title).toBe('3D 表示中はミニマップを使えません');
    expect(minimapTab().getAttribute('aria-selected')).toBe('false');
    skinToggle(root).click();
    expect(minimapTab().disabled).toBe(false);
  });

  it('destroy で 3D レンダラも破棄される', async () => {
    const { root, handle } = mount();
    await flush();
    skinToggle(root).click();
    handle.destroy();
    expect(fake.dispose).toHaveBeenCalled();
  });
});
