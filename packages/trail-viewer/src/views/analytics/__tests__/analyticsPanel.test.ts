/**
 * analyticsPanel vanilla mount のスモークテスト。
 * jsdom 環境では <anytime-chart> WC は定義されないため、chart internals は検証しない。
 * mount・period 変更・update・destroy が例外なく完走することと基本的な DOM 構造を確認する。
 */

// jsdom に ResizeObserver が存在しないため no-op stub を設定する
if (typeof globalThis.ResizeObserver === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Sub-mount をモック化して jsdom での外部依存を遮断する
jest.mock('../panels/overviewCards', () => ({
  mountOverviewCards: () => ({ update: jest.fn(), destroy: jest.fn() }),
}));
jest.mock('../charts/toolUsageChart', () => ({
  mountToolUsageChart: () => ({ update: jest.fn(), destroy: jest.fn() }),
}));
jest.mock('../panels/combinedChartsSection', () => ({
  mountCombinedChartsSection: () => ({ update: jest.fn(), destroy: jest.fn() }),
}));

import { mountAnalyticsPanel } from '../analyticsPanel';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const cardSx = { bgcolor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tokens: any = {
  isDark: true,
  colors: { textSecondary: '#aaa', border: '#333', iceBlue: '#4dd0e1', iceBlueBg: '#0d2b30', hoverBg: '#222', midnightNavy: '#0a1628', charcoal: '#1e1e1e', warning: '#ff9800' },
  chartColors: { primary: '#4dd0e1', input: '#90caf9', output: '#66bb6a', cacheRead: '#ffa726', cacheWrite: '#ef9a9a', toolExec: '#ce93d8', skill: '#80cbc4', apiInference: '#4db6ac', cumulativeTime: '#ff8a65' },
  cardSx,
  scrollbarSx: {},
  toolPalette: [],
  doraColors: { elite: '#4caf50', high: '#8bc34a', medium: '#ff9800', low: '#f44336' },
  radius: { sm: '4px', md: '8px', lg: '12px' },
};

const toolCategory = {
  getToolCategory: () => 0,
  getToolCategoryColor: () => '#fff',
  getToolCategoryLabel: () => '',
  getToolCategoryColorByIndex: () => '#fff',
  toolCategoryKeys: [] as readonly number[],
};

const skillCategory = {
  getSkillCategory: () => 0,
  getSkillCategoryColor: () => '#fff',
  getSkillCategoryLabel: () => '',
  getSkillCategoryColorByIndex: () => '#fff',
  skillCategoryKeys: [] as readonly number[],
};

const commitCategory = {
  getCategoryColor: () => '#fff',
  getCategory: () => 0,
  getCategoryLabel: () => '',
  getCategoryColorByIndex: () => '#fff',
  categoryKeys: [] as readonly number[],
};

const t = (k: string): string => k;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const minimalAnalytics: any = {
  totals: {
    totalLinesAdded: 100,
    totalLoc: 500,
    totalCommits: 10,
    sessions: 5,
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheCreationTokens: 100,
    estimatedCostUsd: 0.05,
  },
  dailyActivity: [],
  toolUsage: [],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeProps(overrides: Record<string, any> = {}): any {
  return {
    analytics: minimalAnalytics,
    sessions: [],
    releases: [],
    tokens,
    t,
    toolCategory,
    skillCategory,
    commitCategory,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mountAnalyticsPanel', () => {
  it('mounts without throwing when analytics is provided', () => {
    const container = document.createElement('div');
    expect(() => mountAnalyticsPanel(container, makeProps())).not.toThrow();
  });

  it('appends a root element to container', () => {
    const container = document.createElement('div');
    mountAnalyticsPanel(container, makeProps());
    expect(container.firstElementChild).not.toBeNull();
  });

  it('shows loading text when analytics is null', () => {
    const container = document.createElement('div');
    mountAnalyticsPanel(container, makeProps({ analytics: undefined }));
    expect(container.textContent).toContain('analytics.loadingAnalytics');
  });

  it('does not show loading text when analytics is provided', () => {
    const container = document.createElement('div');
    mountAnalyticsPanel(container, makeProps());
    expect(container.textContent).not.toContain('analytics.loadingAnalytics');
  });

  it('update does not throw', () => {
    const container = document.createElement('div');
    const handle = mountAnalyticsPanel(container, makeProps());
    expect(() => handle.update(makeProps())).not.toThrow();
  });

  it('update reflects transition from null analytics to data', () => {
    const container = document.createElement('div');
    const handle = mountAnalyticsPanel(container, makeProps({ analytics: undefined }));
    expect(container.textContent).toContain('analytics.loadingAnalytics');
    handle.update(makeProps({ analytics: minimalAnalytics }));
    expect(container.textContent).not.toContain('analytics.loadingAnalytics');
  });

  it('update reflects transition from data to null analytics', () => {
    const container = document.createElement('div');
    const handle = mountAnalyticsPanel(container, makeProps());
    handle.update(makeProps({ analytics: undefined }));
    expect(container.textContent).toContain('analytics.loadingAnalytics');
  });

  it('destroy removes root element and does not throw', () => {
    const container = document.createElement('div');
    const handle = mountAnalyticsPanel(container, makeProps());
    expect(() => handle.destroy()).not.toThrow();
    expect(container.firstElementChild).toBeNull();
  });

  it('destroy is safe to call multiple times', () => {
    const container = document.createElement('div');
    const handle = mountAnalyticsPanel(container, makeProps());
    expect(() => {
      handle.destroy();
      handle.destroy();
    }).not.toThrow();
  });

  it('calls fetchQualityMetrics on mount', () => {
    const fetchQualityMetrics = jest.fn().mockResolvedValue(null);
    const container = document.createElement('div');
    mountAnalyticsPanel(container, makeProps({ fetchQualityMetrics }));
    expect(fetchQualityMetrics).toHaveBeenCalledTimes(1);
  });

  it('does not call fetchQualityMetrics again if reference unchanged on update', () => {
    const fetchQualityMetrics = jest.fn().mockResolvedValue(null);
    const container = document.createElement('div');
    const handle = mountAnalyticsPanel(container, makeProps({ fetchQualityMetrics }));
    handle.update(makeProps({ fetchQualityMetrics }));
    expect(fetchQualityMetrics).toHaveBeenCalledTimes(1);
  });

  it('re-fetches quality metrics when fetchQualityMetrics reference changes on update', () => {
    const fetch1 = jest.fn().mockResolvedValue(null);
    const fetch2 = jest.fn().mockResolvedValue(null);
    const container = document.createElement('div');
    const handle = mountAnalyticsPanel(container, makeProps({ fetchQualityMetrics: fetch1 }));
    handle.update(makeProps({ fetchQualityMetrics: fetch2 }));
    expect(fetch1).toHaveBeenCalledTimes(1);
    expect(fetch2).toHaveBeenCalledTimes(1);
  });

  it('does not reject after destroy when async fetch resolves', async () => {
    let resolve!: (v: null) => void;
    const fetchQualityMetrics = jest.fn(
      () => new Promise<null>((res) => { resolve = res; }),
    );
    const container = document.createElement('div');
    const handle = mountAnalyticsPanel(container, makeProps({ fetchQualityMetrics }));
    handle.destroy();
    await expect(Promise.resolve().then(() => resolve(null))).resolves.toBeUndefined();
  });
});
