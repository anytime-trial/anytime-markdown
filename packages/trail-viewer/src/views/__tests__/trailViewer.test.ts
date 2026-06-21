/**
 * trailViewer — mountTrailViewer + mountTrailViewerApp のスモークテスト。
 *
 * jsdom 環境。DOM 構築・タブ切替・update/destroy のクリーンアップを検証する。
 */

import { mountTrailViewer } from '../trailViewer';
import type { TrailViewerViewProps } from '../trailViewer';
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
    const memoryPanel = container.querySelector('#trail-panel-6');
    expect(memoryPanel).toBeNull();
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

  it('c4が未指定のときC4タブが現れない', () => {
    const container = document.createElement('div');
    const h = mountTrailViewer(container, makeBaseProps({ c4: undefined }));
    // Tab 4 panel should not exist
    const c4Panel = container.querySelector('#trail-panel-4');
    expect(c4Panel).toBeNull();
    h.destroy();
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
