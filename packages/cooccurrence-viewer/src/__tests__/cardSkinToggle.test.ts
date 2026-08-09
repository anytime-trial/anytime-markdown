/**
 * @jest-environment jsdom
 */
import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';
import type { CooccurrenceViewerOptions } from '../types';

function fixtureFile(): CooccurrenceFile {
  const base: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-08-08T00:00:00.000Z', origin: 'manual' },
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

function flush(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

function mount(over: Partial<CooccurrenceViewerOptions> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCooccurrenceViewer(container, {
    file: fixtureFile(),
    themeMode: 'light',
    locale: 'ja',
    ...over,
  });
  const root = container.querySelector('.cooc-viewer') as HTMLElement;
  return { container, handle, root };
}

/** ツールバーの 2 つ目の aria-pressed ボタンがカードのトグル（1 つ目は OZ）。 */
function cardToggle(root: HTMLElement): HTMLButtonElement {
  const buttons = root.querySelectorAll('.cooc-viewer__toolbar button[aria-pressed]');
  const button = buttons[1];
  if (!(button instanceof HTMLButtonElement)) throw new Error('card toggle not found');
  return button;
}

describe('カード表示のトグルと配線', () => {
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

  it('初期状態はカード表示でなく、観測点は null を返す', async () => {
    const { handle, root } = mount();
    await flush();
    expect(cardToggle(root).textContent).toBe('カード');
    expect(cardToggle(root).getAttribute('aria-pressed')).toBe('false');
    expect(handle.getCardLayoutState()).toBeNull();
  });

  it('トグルでカード表示になり、カラム割りが観測点から読める', async () => {
    const { handle, root } = mount();
    await flush();
    cardToggle(root).click();
    expect(cardToggle(root).getAttribute('aria-pressed')).toBe('true');
    // クラスタ A のカラム + 未分類カラム（Gamma）
    expect(handle.getCardLayoutState()).toEqual({
      columnCount: 2,
      cardCount: 3,
      hasUnclustered: true,
      subHeaderCount: 0,
      maxRows: 20,
    });
  });

  it('再トグルで標準へ戻り、観測点が null へ戻る', async () => {
    const { handle, root } = mount();
    await flush();
    cardToggle(root).click();
    cardToggle(root).click();
    expect(cardToggle(root).getAttribute('aria-pressed')).toBe('false');
    expect(handle.getCardLayoutState()).toBeNull();
  });

  it('update({skin}) でも切り替わる（mount オプションと同じ経路）', async () => {
    const { handle } = mount();
    await flush();
    handle.update({ skin: 'card' });
    expect(handle.getCardLayoutState()).not.toBeNull();
    handle.update({ skin: 'standard' });
    expect(handle.getCardLayoutState()).toBeNull();
  });

  it('mount オプション skin: card で最初からカード表示になる', async () => {
    const { handle, root } = mount({ skin: 'card' });
    await flush();
    expect(cardToggle(root).getAttribute('aria-pressed')).toBe('true');
    expect(handle.getCardLayoutState()).not.toBeNull();
  });

  it('絞り込みがカード図へ反映され、空になったカラムは消える', async () => {
    const { handle, root } = mount();
    await flush();
    cardToggle(root).click();
    handle.update({ filter: { minFrequency: 2 } });
    // Gamma（頻度 1・未分類）が消え、未分類カラムごと無くなる
    expect(handle.getCardLayoutState()).toEqual({
      columnCount: 1,
      cardCount: 2,
      hasUnclustered: false,
      subHeaderCount: 0,
      maxRows: 20,
    });
  });

  it('カード表示中は時間タブが無効になり、理由が読める', async () => {
    const { root } = mount();
    await flush();
    const timelineTab = () => root.querySelector('button[aria-controls$="timeline"]') as HTMLButtonElement;
    expect(timelineTab().disabled).toBe(false);
    cardToggle(root).click();
    expect(timelineTab().disabled).toBe(true);
    expect(timelineTab().title).toBe('カード表示中はレイヤー表示を使えません');
    cardToggle(root).click();
    expect(timelineTab().disabled).toBe(false);
  });

  it('カード表示中はレーンのトグルが無効になり、レーンの観測点は null になる', async () => {
    const { handle, root } = mount();
    await flush();
    const laneToggle = (): HTMLInputElement => {
      const checkbox = root.querySelector('.cooc-clusters__lane input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement)) throw new Error('lane toggle not found');
      return checkbox;
    };
    expect(laneToggle().disabled).toBe(false);
    // レーン表示を有効にしてからカード表示へ移る（レーンの意図が残っていても図はレーン化しない）
    laneToggle().click();
    expect(handle.getClusterLaneState()).not.toBeNull();
    cardToggle(root).click();
    expect(laneToggle().disabled).toBe(true);
    expect(handle.getClusterLaneState()).toBeNull();
    expect(handle.getCardLayoutState()).not.toBeNull();
    // 標準へ戻すとレーンの意図が復活する
    cardToggle(root).click();
    expect(laneToggle().disabled).toBe(false);
    expect(handle.getClusterLaneState()).not.toBeNull();
  });
});
