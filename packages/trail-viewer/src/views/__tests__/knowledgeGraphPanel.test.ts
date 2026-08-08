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
      `${SERVER_URL}/api/memory/knowledge-graph?limit=150`,
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
    expect(viewerHandleMock.update).toHaveBeenCalledWith({ file: expect.anything() });
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
