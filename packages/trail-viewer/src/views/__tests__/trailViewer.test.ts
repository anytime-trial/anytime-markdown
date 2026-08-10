/**
 * trailViewer — mountTrailViewer + mountTrailViewerApp のスモークテスト。
 *
 * jsdom 環境。DOM 構築・タブ切替・update/destroy のクリーンアップを検証する。
 */

// trailViewer → c4Viewer → codeGraphPanel statically pulls sigma, which needs
// WebGL2RenderingContext (absent in jsdom). Mock it at module level.
jest.mock('sigma', () => ({
  __esModule: true,
  default: class MockSigma {
    on() { /* no-op */ }
    getGraph() { return { forEachNode: () => { /* no-op */ }, setNodeAttribute: () => { /* no-op */ } }; }
    refresh() { /* no-op */ }
    kill() { /* no-op */ }
  },
}));
jest.mock('sigma/rendering', () => ({
  EdgeArrowProgram: class MockEdgeArrowProgram {},
}));

// Mock mountReactIsland so tests don't need a full React DOM render environment.
// Each call appends a sentinel div to the container and returns spy handles.
jest.mock('../reactIsland', () => ({
  mountReactIsland: jest.fn((container: HTMLElement) => {
    const sentinel = document.createElement('div');
    sentinel.setAttribute('data-react-island', 'true');
    container.appendChild(sentinel);
    return {
      update: jest.fn(),
      destroy: jest.fn(() => { sentinel.remove(); }),
    };
  }),
}));

// Also mock PromptManagerIsland and TraceViewer so tsx imports don't blow up in ts-jest.
jest.mock('../PromptManagerIsland', () => ({ PromptManagerIsland: 'PromptManagerIsland' }));
// 知識グラフタブの描画（canvas 前提）は jsdom で動かないためモックする
jest.mock('@anytime-markdown/cooccurrence-viewer', () => ({
  mountCooccurrenceViewer: jest.fn(() => ({
    update: jest.fn(),
    destroy: jest.fn(),
    selectNode: jest.fn(),
    getSelectedNodeIndex: jest.fn(() => null),
  })),
  createInlineLayoutWorker: () => null,
}));
jest.mock('@anytime-markdown/trace-viewer', () => ({ TraceViewer: 'TraceViewer' }));

// Mock analyticsPanel so we can capture onOpenPromptsPopup callback for popup tests.
let capturedOnOpenPromptsPopup: (() => void) | undefined;
jest.mock('../analytics/analyticsPanel', () => {
  const actual = jest.requireActual<typeof import('../analytics/analyticsPanel')>('../analytics/analyticsPanel');
  return {
    ...actual,
    mountAnalyticsPanel: jest.fn((container: HTMLElement, props: Record<string, unknown>) => {
      capturedOnOpenPromptsPopup = props['onOpenPromptsPopup'] as () => void;
      return actual.mountAnalyticsPanel(container, props as never);
    }),
  };
});

import { mountTrailViewer } from '../trailViewer';
import type { TrailViewerViewProps } from '../trailViewer';
import { mountReactIsland } from '../reactIsland';
import { getTokens } from '../../theme/designTokens';
import type { TrailSession, TrailFilter } from '../../domain/parser/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const t = (key: string): string => key;

function makeFilter(over: Partial<TrailFilter> = {}): TrailFilter {
  return { searchText: undefined, workspace: undefined, ...over };
}

function makeSession(over: Partial<TrailSession> = {}): TrailSession {
  return {
    id: 'session-abc123',
    slug: 'my-feature',
    repoName: 'anytime-markdown',
    gitBranch: 'feature/x',
    startTime: '2026-06-21T00:00:00.000Z',
    endTime: '2026-06-21T01:00:00.000Z',
    version: '1.0.0',
    model: 'claude-sonnet-4-6',
    messageCount: 42,
    source: 'claude_code',
    errorCount: 0,
    subAgentCount: 0,
    workspace: '/home/user/project',
    usage: {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 500,
      cacheCreationTokens: 100,
    },
    ...over,
  };
}

const darkColors = {
  midnightNavy: '#0D1117',
  charcoal: '#121212',
  border: 'rgba(255,255,255,0.12)',
  textSecondary: 'rgba(255,255,255,0.70)',
  textPrimary: '#FFFFFF',
  iceBlue: '#90CAF9',
  error: '#EF5350',
  success: '#66BB6A',
};

function makeNoopToolCategory() {
  return {
    getToolCategory: () => 4,
    getToolCategoryColor: () => 'rgba(128,128,128,0.5)',
    getToolCategoryLabel: () => 'その他',
    getToolCategoryColorByIndex: () => 'rgba(128,128,128,0.5)',
    toolCategoryKeys: [0, 1, 2, 3, 4] as readonly number[],
  };
}

function makeNoopSkillCategory() {
  return {
    getSkillCategory: () => 3,
    getSkillCategoryColor: () => 'rgba(128,128,128,0.5)',
    getSkillCategoryLabel: () => 'その他',
    getSkillCategoryColorByIndex: () => 'rgba(128,128,128,0.5)',
    skillCategoryKeys: [0, 1, 2, 3] as readonly number[],
  };
}

function makeNoopCommitCategory() {
  return {
    getCategoryColor: () => '#9E9E9E',
    getCategory: () => 2,
    getCategoryLabel: () => 'その他',
    getCategoryColorByIndex: () => '#9E9E9E',
    categoryKeys: [0, 1, 2] as readonly number[],
  };
}

function makeBaseProps(over: Partial<TrailViewerViewProps> = {}): TrailViewerViewProps {
  return {
    sessions: [],
    messages: [],
    filter: makeFilter(),
    onSelectSession: () => {},
    onFilterChange: () => {},
    t,
    tokens: getTokens(true),
    toolCategory: makeNoopToolCategory(),
    skillCategory: makeNoopSkillCategory(),
    commitCategory: makeNoopCommitCategory(),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// mountTrailViewer
// ---------------------------------------------------------------------------

describe('mountTrailViewer', () => {
  it('タブバーをDOMにマウントする', () => {
    const container = document.createElement('div');
    const h = mountTrailViewer(container, makeBaseProps());
    expect(container.children.length).toBeGreaterThan(0);
    h.destroy();
  });

  it('destroy でDOMを撤去する', () => {
    const container = document.createElement('div');
    const h = mountTrailViewer(container, makeBaseProps());
    h.destroy();
    expect(container.children.length).toBe(0);
  });

  it('初期タブ0でAnalyticsPanelをマウントする', () => {
    const container = document.createElement('div');
    const h = mountTrailViewer(container, makeBaseProps({ initialTab: 0 }));
    // Analytics panel should be in DOM
    expect(container.querySelector('[role="tabpanel"]')).not.toBeNull();
    h.destroy();
  });

  it('visitedTabsが初期タブを記録する', () => {
    const tabsVisited: number[] = [];
    const container = document.createElement('div');
    const h = mountTrailViewer(container, makeBaseProps({
      onTabVisit: (tab) => tabsVisited.push(tab),
    }));
    expect(tabsVisited).toContain(0);
    h.destroy();
  });

  it('update で props を反映する', () => {
    const container = document.createElement('div');
    const h = mountTrailViewer(container, makeBaseProps());

    const session = makeSession();
    h.update(makeBaseProps({
      sessions: [session],
      selectedSessionId: session.id,
      messages: [],
    }));

    h.destroy();
    expect(container.children.length).toBe(0);
  });

  it('メモリタブのパネルコンテナが存在しない(まだ訪問前)', () => {
    const container = document.createElement('div');
    const h = mountTrailViewer(container, makeBaseProps({ initialTab: 0 }));
    // Tab 6 (memory) should not have been mounted yet
    const caravanPanel = container.querySelector('#trail-panel-6');
    expect(caravanPanel).toBeNull();
    h.destroy();
  });

  it('initialTab=10 で Chat パネルをトップレベルにマウントする', () => {
    const container = document.createElement('div');
    const h = mountTrailViewer(container, makeBaseProps({ initialTab: 10 }));

    // Chat は Memory サブタブではなく trail-panel-10 直下にマウントされる
    const chatPanel = container.querySelector('#trail-panel-10');
    expect(chatPanel).not.toBeNull();
    expect(chatPanel?.querySelector('[aria-label="chat-panel"]')).not.toBeNull();
    // Caravan パネル（tab 6）は訪問していないのでマウントされない
    expect(container.querySelector('#trail-panel-6')).toBeNull();

    h.destroy();
    expect(container.querySelector('[aria-label="chat-panel"]')).toBeNull();
  });

  it('Chat の entity 引用クリックで知識グラフタブへ切り替え、該当実体の seed 取得へ入る（知識グラフ設計書 §3.6）', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => null });
    global.fetch = fetchMock as unknown as typeof fetch;
    const handlers = new Set<(chunk: unknown) => void>();
    const bridge = {
      status: 'ready',
      detail: undefined,
      subscribe(handler: (chunk: unknown) => void) {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
      send: () => {},
      abort: () => {},
      recheck: () => {},
    } as unknown as NonNullable<TrailViewerViewProps['bridge']>;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const h = mountTrailViewer(container, makeBaseProps({ initialTab: 10, serverUrl: 'http://s', bridge }));

    // SEND で状態を初期化してから citation 付きの回答を流す
    const input = container.querySelector<HTMLTextAreaElement>('#trail-panel-10 textarea');
    if (input) input.value = 'q';
    const sendBtn = container.querySelector<HTMLButtonElement>('[aria-label="caravan.chat.send"]');
    sendBtn?.removeAttribute('disabled');
    sendBtn?.click();
    for (const emit of handlers) {
      emit({ type: 'sources', payload: [] });
      emit({ type: 'token', payload: { delta: 'See [^entity:e42].' } });
      emit({ type: 'done', payload: { interrupted: false } });
    }

    // チップ実装のクラス名に依存せず、回答ログ内を総当たりでクリックする
    const log = container.querySelector<HTMLElement>('#trail-panel-10 [role="log"]');
    expect(log).not.toBeNull();
    expect(log?.textContent ?? '').toContain('See');
    for (const el of log?.querySelectorAll<HTMLElement>('*') ?? []) el.click();
    await Promise.resolve();
    await Promise.resolve();

    // 知識グラフタブ（値 11）がマウントされ、seed 付き取得が走っている
    expect(container.querySelector('#trail-panel-11')).not.toBeNull();
    const seedCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('seed=e42'),
    );
    expect(seedCall).toBeDefined();
    h.destroy();
    container.remove();
  });

  it('タブは アクティビティ / 実行記録 / 知識グラフ / パイプライン / Chat の順に並ぶ', () => {
    const container = document.createElement('div');
    // C4 / トレースのデータが無い props なので、C4 依存タブ（4 / 5 / 7）は出ない。
    const h = mountTrailViewer(container, makeBaseProps({ initialTab: 0 }));

    // ui-core createTabs は id / aria-controls を描画しないため data-value で順序を見る
    const tabValues = [...container.querySelectorAll('[role="tab"]')].map((el) =>
      el.getAttribute('data-value'),
    );
    expect(tabValues).toEqual(['0', '9', '11', '6', '10']);

    h.destroy();
  });

  it('initialTab=1でmessagesPopupを自動で開く', () => {
    const container = document.createElement('div');
    // Tab 1 (messages) triggers popup — should not throw
    expect(() => {
      const h = mountTrailViewer(container, makeBaseProps({ initialTab: 1 }));
      h.destroy();
    }).not.toThrow();
  });

  it('popup ホストは trail-viewer 内に置かれ destroy で撤去される', () => {
    jest.clearAllMocks();
    capturedOnOpenPromptsPopup = undefined;

    const container = document.createElement('div');
    const prompts = [{ id: 'p1', name: 'Prompt 1', content: '# Hello', tags: [], version: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
    const h = mountTrailViewer(container, makeBaseProps({ prompts, initialTab: 0 }));

    // Open prompts popup — host は document.body ではなく trail-viewer ルート内に置かれる
    // （埋込時にページ全体を覆わないため）。
    (capturedOnOpenPromptsPopup as unknown as () => void)?.();

    // popup の中身（react island sentinel）が container 内に存在する
    expect(container.querySelector('[data-react-island="true"]')).not.toBeNull();
    // document.body には漏れない
    expect(document.body.querySelector('[data-react-island="true"]')).toBeNull();

    h.destroy();

    // destroy 後は container から撤去される
    expect(container.querySelector('[data-react-island="true"]')).toBeNull();
  });

  it('c4が未指定のときC4タブが現れない', () => {
    const container = document.createElement('div');
    const h = mountTrailViewer(container, makeBaseProps({ c4: undefined }));
    // Tab 4 panel should not exist
    const c4Panel = container.querySelector('#trail-panel-4');
    expect(c4Panel).toBeNull();
    h.destroy();
  });

  it('traceFilesあり: Traceタブ訪問でReact islandをマウントする', () => {
    const container = document.createElement('div');
    const traceFiles = [{ name: 'trace.json', load: async () => '{}' }];
    const h = mountTrailViewer(container, makeBaseProps({ traceFiles, initialTab: 5 }));

    // The trace panel (tab 5) should exist
    const tracePanel = container.querySelector('#trail-panel-5');
    expect(tracePanel).not.toBeNull();

    // A react island sentinel should be inside the trace panel
    const island = tracePanel?.querySelector('[data-react-island="true"]');
    expect(island).not.toBeNull();

    // mountReactIsland should have been called with TraceViewer
    expect(mountReactIsland).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'TraceViewer',
      expect.objectContaining({ traceFiles }),
    );

    h.destroy();

    // After destroy, the island sentinel should be removed by the mock's destroy()
    expect(tracePanel?.querySelector('[data-react-island="true"]')).toBeNull();
  });

  it('Promptsポップアップ開放でmountReactIslandがPromptManagerIslandで呼ばれdestroyでクリーンアップされる', () => {
    jest.clearAllMocks();
    capturedOnOpenPromptsPopup = undefined;

    const container = document.createElement('div');
    const prompts = [{ id: 'p1', name: 'Prompt 1', content: '# Hello', tags: [], version: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
    const h = mountTrailViewer(container, makeBaseProps({ prompts, initialTab: 0 }));

    // capturedOnOpenPromptsPopup was set by the mocked mountAnalyticsPanel.
    // Invoke it to open the prompts popup — this calls syncPromptsPopup() internally.
    expect(capturedOnOpenPromptsPopup).toBeDefined();
    (capturedOnOpenPromptsPopup as unknown as () => void)();

    // mountReactIsland should have been called with PromptManagerIsland
    expect(mountReactIsland).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'PromptManagerIsland',
      expect.objectContaining({ prompts }),
    );

    // A sentinel should exist inside the trail-viewer container (popup host appended to root)
    const sentinel = container.querySelector('[data-react-island="true"]');
    expect(sentinel).not.toBeNull();

    h.destroy();
    // After destroy, the island sentinel should be cleaned up
    const orphans = container.querySelectorAll('[data-react-island="true"]');
    expect(orphans.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mountTrailViewerApp (store layer smoke test)
// ---------------------------------------------------------------------------

describe('mountTrailViewerApp', () => {
  beforeEach(() => {
    // Stub fetch so store initialisation doesn't throw
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('マウントしてもクラッシュしない', async () => {
    const { mountTrailViewerApp } = await import('../trailViewerApp');
    const container = document.createElement('div');
    const h = mountTrailViewerApp(container, {
      serverUrl: 'http://127.0.0.1:7531',
      isDark: true,
      disableWebSocket: true,
    });
    expect(container.children.length).toBeGreaterThan(0);
    h.destroy();
  });

  it('destroy でクリーンアップする', async () => {
    const { mountTrailViewerApp } = await import('../trailViewerApp');
    const container = document.createElement('div');
    const h = mountTrailViewerApp(container, {
      serverUrl: 'http://127.0.0.1:7531',
      isDark: true,
      disableWebSocket: true,
    });
    h.destroy();
    expect(container.children.length).toBe(0);
  });

  it('update で serverUrl 変更を受け付ける', async () => {
    const { mountTrailViewerApp } = await import('../trailViewerApp');
    const container = document.createElement('div');
    const h = mountTrailViewerApp(container, {
      serverUrl: 'http://127.0.0.1:7531',
      isDark: true,
      disableWebSocket: true,
    });
    expect(() => {
      h.update({
        serverUrl: 'http://127.0.0.1:7532',
        isDark: false,
        disableWebSocket: true,
      });
    }).not.toThrow();
    h.destroy();
  });
});
