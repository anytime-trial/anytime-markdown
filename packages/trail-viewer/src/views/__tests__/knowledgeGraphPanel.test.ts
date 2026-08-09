/**
 * knowledgeGraphPanel の状態遷移テスト（設計書 §3.2）。
 *
 * cooccurrence-viewer は canvas 前提で jsdom では描けないためモックする。
 * 実描画・テーマ切替の見た目は実機受け入れ試験が担う（jsdom 非再現の既知制約）。
 */
const mountViewerMock = jest.fn();
const viewerHandleMock = {
  update: jest.fn(),
  destroy: jest.fn(),
};
jest.mock('@anytime-markdown/cooccurrence-viewer', () => ({
  mountCooccurrenceViewer: (...args: unknown[]) => {
    mountViewerMock(...args);
    return viewerHandleMock;
  },
  createInlineLayoutWorker: () => null,
}));

import { mountKnowledgeGraphPanel, type KnowledgeGraphPanelProps } from '../knowledgeGraphPanel';
import type { KnowledgeGraphResponse } from '../knowledgeGraphCoocFile';
import { getTokens } from '../../theme/designTokens';
import { ja } from '../../i18n/ja';

const SERVER_URL = 'http://localhost:4707';

const SAMPLE: KnowledgeGraphResponse = {
  nodes: [
    { label: 'TrailDataServer', type: 'Concept', frequency: 4 },
    { label: 'trail-caravan-book', type: 'Package', frequency: 2 },
  ],
  links: [{ a: 0, b: 1, strength: 2 }],
  clusters: [
    { label: 'Concept', members: [0] },
    { label: 'Package', members: [1] },
  ],
  totalEntityCount: 29695,
  truncated: true,
  availableTypes: ['Concept', 'Package'],
};

function t(key: string): string {
  return (ja as unknown as Record<string, string>)[key] ?? key;
}

function makeProps(partial?: Partial<KnowledgeGraphPanelProps>): KnowledgeGraphPanelProps {
  return {
    serverUrl: SERVER_URL,
    isDark: true,
    tokens: getTokens(true),
    t,
    ...partial,
  };
}

function okResponse(body: KnowledgeGraphResponse | null): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

/** mount 直後の初回 fetch を含む in-flight を全部流す。 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('mountKnowledgeGraphPanel', () => {
  let container: HTMLElement;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    container.remove();
  });

  it('fetches on mount and mounts the viewer with the converted file', async () => {
    fetchMock.mockResolvedValue(okResponse(SAMPLE));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      `${SERVER_URL}/api/caravan/knowledge-graph?limit=150`,
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(mountViewerMock).toHaveBeenCalledTimes(1);
    const options = mountViewerMock.mock.calls[0][1] as {
      file: { spec: { nodes: unknown[] } };
      themeMode: string;
      showPanels: boolean;
    };
    expect(options.themeMode).toBe('dark');
    expect(options.showPanels).toBe(true);
    expect(options.file.spec.nodes).toEqual([
      { label: 'TrailDataServer', frequency: 4 },
      { label: 'trail-caravan-book', frequency: 2 },
    ]);
    // 件数表示（表示 N / 全 M 件）が出る
    expect(container.querySelector('[data-am-kg-count]')?.textContent).toBe('表示 2 / 全 29695 件');
    // 成功時はステータス行が消え、viewer ホストが見える
    expect(container.querySelector<HTMLElement>('[data-am-kg-status]')?.hidden).toBe(true);
    expect(container.querySelector<HTMLElement>('[data-am-kg-viewer]')?.hidden).toBe(false);
    handle.destroy();
  });

  it('shows the failure state when the server is unreachable (not the empty state)', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();

    const status = container.querySelector<HTMLElement>('[data-am-kg-status]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toBe(t('knowledgeGraph.loadFailed'));
    expect(mountViewerMock).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('treats a 200 + null body as failure (DB not configured), distinct from 0 nodes', async () => {
    fetchMock.mockResolvedValue(okResponse(null));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();

    expect(container.querySelector('[data-am-kg-status]')?.textContent).toBe(t('knowledgeGraph.loadFailed'));
    handle.destroy();
  });

  it('shows the empty state for a graph with no nodes', async () => {
    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, nodes: [], links: [], clusters: [] }));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();

    expect(container.querySelector('[data-am-kg-status]')?.textContent).toBe(t('knowledgeGraph.empty'));
    expect(mountViewerMock).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('refetches on reload and updates the mounted viewer instead of remounting', async () => {
    fetchMock.mockResolvedValue(okResponse(SAMPLE));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();

    container.querySelector<HTMLButtonElement>('[data-am-kg-reload]')?.click();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mountViewerMock).toHaveBeenCalledTimes(1);
    // 操作起因の再取得は視野を保たない（全体表示へ合わせ直す）
    expect(viewerHandleMock.update).toHaveBeenCalledWith({
      file: expect.anything(),
      preserveViewport: false,
    });
    handle.destroy();
  });

  it('propagates theme changes to the viewer via update()', async () => {
    fetchMock.mockResolvedValue(okResponse(SAMPLE));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();

    handle.update(makeProps({ isDark: false, tokens: getTokens(false) }));

    expect(viewerHandleMock.update).toHaveBeenCalledWith({ themeMode: 'light' });
    handle.destroy();
  });

  it('does not fetch when serverUrl is empty', async () => {
    const handle = mountKnowledgeGraphPanel(container, makeProps({ serverUrl: '' }));
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    handle.destroy();
  });
});

describe('mountKnowledgeGraphPanel — viewport-driven delivery', () => {
  let container: HTMLElement;
  let fetchMock: jest.Mock;

  /** 直近の mount で viewer へ渡された視野コールバック。 */
  function viewportCallback(): (b: { minX: number; minY: number; maxX: number; maxY: number }) => void {
    const options = mountViewerMock.mock.calls.at(-1)?.[1] as {
      onViewportChange?: (b: { minX: number; minY: number; maxX: number; maxY: number }) => void;
    };
    const cb = options?.onViewportChange;
    if (!cb) throw new Error('viewer was mounted without onViewportChange');
    return cb;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    container.remove();
  });

  it('records the first viewport without refetching (全体取得の直後は取り直さない)', async () => {
    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, bboxApplied: false }));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();

    viewportCallback()({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('refetches with the bbox once the view has moved meaningfully', async () => {
    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, bboxApplied: true }));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();
    const notify = viewportCallback();

    notify({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    notify({ minX: 25, minY: 25, maxX: 75, maxY: 75 });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${SERVER_URL}/api/caravan/knowledge-graph?limit=150&bbox=25%2C25%2C75%2C75`,
    );
    handle.destroy();
  });

  it('keeps the current figure and the camera while the viewport fetch lands', async () => {
    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, bboxApplied: true }));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();
    const notify = viewportCallback();
    const statusEl = container.querySelector<HTMLElement>('[data-am-kg-status]');
    const viewerHost = container.querySelector<HTMLElement>('[data-am-kg-viewer]');

    notify({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    notify({ minX: 25, minY: 25, maxX: 75, maxY: 75 });

    // 取得の最中も図は出たまま（読み込み表示へ切り替えない）
    expect(viewerHost?.hidden).toBe(false);
    expect(statusEl?.hidden).toBe(true);

    await flush();
    expect(viewerHandleMock.update).toHaveBeenCalledWith({
      file: expect.anything(),
      preserveViewport: true,
    });
    handle.destroy();
  });

  it('stops viewport fetching when the server reports it could not apply the bbox', async () => {
    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, bboxApplied: false }));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();
    const notify = viewportCallback();

    notify({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    notify({ minX: 25, minY: 25, maxX: 75, maxY: 75 });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 座標を持たないサーバに対して視野で取り直しても結果は変わらない。以後は要求しない
    notify({ minX: 200, minY: 200, maxX: 250, maxY: 250 });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    handle.destroy();
  });

  it('keeps the current figure when the viewport lands on empty space', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ ...SAMPLE, bboxApplied: true }));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();
    const notify = viewportCallback();
    const viewerHost = container.querySelector<HTMLElement>('[data-am-kg-viewer]');

    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, nodes: [], links: [], clusters: [], bboxApplied: true }));
    notify({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    notify({ minX: 900, minY: 900, maxX: 1000, maxY: 1000 });
    await flush();

    // 図を消すと canvas ごと隠れ、パンで戻ることも取り直すこともできなくなる
    expect(viewerHost?.hidden).toBe(false);
    expect(viewerHandleMock.update).not.toHaveBeenCalled();

    // 戻ってこられること（視野駆動が止まっていない）
    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, bboxApplied: true }));
    notify({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    await flush();
    expect(viewerHandleMock.update).toHaveBeenCalledWith({
      file: expect.anything(),
      preserveViewport: true,
    });
    handle.destroy();
  });

  it('resumes viewport fetching after an explicit reload (ラッチにしない)', async () => {
    // レイアウト計算前の窓で 1 回パンすると bboxApplied=false が返る。以後ずっと視野駆動を
    // 使わないままだと、本機能が丸ごと無効な状態がユーザーから見えない形で固定される
    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, bboxApplied: false }));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();
    const notify = viewportCallback();
    notify({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    notify({ minX: 25, minY: 25, maxX: 75, maxY: 75 });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 座標が書かれた後に再読込 → 視野駆動が戻ること
    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, bboxApplied: true }));
    container.querySelector<HTMLButtonElement>('[data-am-kg-reload]')?.click();
    await flush();
    // 全体取得の直後の 1 通目は基準として記録するだけ（設計どおり）。2 通目で取り直す
    notify({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    notify({ minX: 25, minY: 25, maxX: 75, maxY: 75 });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][0]).toContain('bbox=');
    handle.destroy();
  });

  it('stops viewport fetching when the server omits bboxApplied (旧サーバ)', async () => {
    const legacy = { ...SAMPLE } as Record<string, unknown>;
    delete legacy['bboxApplied'];
    fetchMock.mockResolvedValue(okResponse(legacy as unknown as KnowledgeGraphResponse));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();
    const notify = viewportCallback();

    notify({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    notify({ minX: 25, minY: 25, maxX: 75, maxY: 75 });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    notify({ minX: 200, minY: 200, maxX: 250, maxY: 250 });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    handle.destroy();
  });

  it('keeps the figure when a viewport fetch fails (パン中の一時失敗で図を消さない)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ ...SAMPLE, bboxApplied: true }));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();
    const notify = viewportCallback();
    const viewerHost = container.querySelector<HTMLElement>('[data-am-kg-viewer]');
    const statusEl = container.querySelector<HTMLElement>('[data-am-kg-status]');

    fetchMock.mockRejectedValue(new Error('connection refused'));
    notify({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    notify({ minX: 25, minY: 25, maxX: 75, maxY: 75 });
    await flush();

    expect(viewerHost?.hidden).toBe(false);
    expect(statusEl?.hidden).toBe(true);

    // 失敗しても視野駆動が止まらないこと（loadState が ready のまま）
    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, bboxApplied: true }));
    notify({ minX: 200, minY: 200, maxX: 300, maxY: 300 });
    await flush();
    expect(viewerHandleMock.update).toHaveBeenCalled();
    handle.destroy();
  });

  it('drops the viewport when the user changes a filter (操作は全体へ戻す)', async () => {
    fetchMock.mockResolvedValue(okResponse({ ...SAMPLE, bboxApplied: true }));
    const handle = mountKnowledgeGraphPanel(container, makeProps());
    await flush();
    const notify = viewportCallback();
    notify({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    notify({ minX: 25, minY: 25, maxX: 75, maxY: 75 });
    await flush();

    container.querySelector<HTMLButtonElement>('[data-am-kg-reload]')?.click();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe(`${SERVER_URL}/api/caravan/knowledge-graph?limit=150`);
    handle.destroy();
  });
});
