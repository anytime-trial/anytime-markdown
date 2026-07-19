/**
 * vanilla base chart mounts のスモークテスト。
 * jsdom 環境では `<anytime-chart>` WC は定義されないため、chart internals は検証しない。
 * mount して update / destroy が例外なく完走することを確認する。
 */

// jsdom に ResizeObserver が存在しないため no-op stub を設定する。
if (typeof globalThis.ResizeObserver === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import { computeDailyActivityDataset, mountDailyActivityChart } from '../dailyActivityChart';
import { mountDayCommitPrefixChart } from '../dayCommitPrefixChart';
import { mountReleasesBarChart } from '../releasesBarChart';
import { mountSessionErrorChart } from '../sessionErrorChart';
import { mountToolUsageChart } from '../toolUsageChart';
import { mountTurnLaneChart, mountTurnLaneChartLegend } from '../turnLaneChart';

// ---------------------------------------------------------------------------
//  Shared fixtures
// ---------------------------------------------------------------------------

const cardSx = {
  bgcolor: '#1e1e1e',
  border: '1px solid #333',
  borderRadius: '8px',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chartColors: any = {
  primary: '#4dd0e1',
  input: '#90caf9',
  output: '#66bb6a',
  cacheRead: '#ffa726',
  cacheWrite: '#ef9a9a',
  toolExec: '#ce93d8',
  skill: '#80cbc4',
  apiInference: '#4db6ac',
  cumulativeTime: '#ff8a65',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const colors: any = {
  textSecondary: '#aaa',
  border: '#333',
  iceBlue: '#4dd0e1',
  warning: '#ff9800',
  charcoal: '#1e1e1e',
};

const t = (k: string): string => k;

// ---------------------------------------------------------------------------
//  mountDailyActivityChart
// ---------------------------------------------------------------------------

describe('computeDailyActivityDataset', () => {
  // 直近 14 日分の日次データ（テスト実行日基準。cutoff で落ちないよう相対日付で組む）。
  const buildItems = (days: number) =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return {
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        sessions: 1,
        commits: 1,
        inputTokens: 100,
        outputTokens: 100,
        cacheReadTokens: 100,
        cacheCreationTokens: 100,
        linesAdded: 10,
        linesDeleted: 5,
        estimatedCostUsd: 0.01,
      };
    });

  const baseProps = {
    mode: 'tokens' as const,
    chartColors,
    cardSx,
    isDark: false,
    t,
  };

  it("bucket='day' は日次データをそのまま返す", () => {
    const items = buildItems(14);
    const dataset = computeDailyActivityDataset({ ...baseProps, items, period: 30, bucket: 'day' });
    expect(dataset).toHaveLength(14);
  });

  it("bucket='week' は週バケットへ集約する", () => {
    const items = buildItems(14);
    const dataset = computeDailyActivityDataset({ ...baseProps, items, period: 30, bucket: 'week' });
    expect(dataset.length).toBeGreaterThan(0);
    expect(dataset.length).toBeLessThan(14);
  });

  // 旧実装は period === 90 で暗黙に週集計していた。期間と集計単位は直交する。
  it('period=90 でも bucket=day なら日次のまま集約しない', () => {
    const items = buildItems(14);
    const dataset = computeDailyActivityDataset({ ...baseProps, items, period: 90, bucket: 'day' });
    expect(dataset).toHaveLength(14);
  });

  it('period が短いと cutoff より前のデータを除外する', () => {
    const items = buildItems(14);
    const dataset = computeDailyActivityDataset({ ...baseProps, items, period: 3, bucket: 'day' });
    expect(dataset.length).toBeLessThan(14);
  });

  it("mode='loc' は行数のみを載せ、トークン/コストと overlay を落とす", () => {
    const items = buildItems(3);
    const dataset = computeDailyActivityDataset({
      ...baseProps, mode: 'loc', items, period: 30, bucket: 'day',
    });
    expect(dataset).toHaveLength(3);
    expect(dataset[0].linesAdded).toBe(10);
    expect(dataset[0].linesDeleted).toBe(5);
    expect(dataset[0].inputTokens).toBe(0);
    expect(dataset[0].actualCost).toBe(0);
    // 分母が LOC 自身になるため tok/LOC overlay は出さない。
    expect(dataset[0].overlayValue).toBeNull();
  });

  it("mode='tokens' は行数を載せず tok/LOC overlay を出す", () => {
    const items = buildItems(3);
    const dataset = computeDailyActivityDataset({ ...baseProps, items, period: 30, bucket: 'day' });
    expect(dataset[0].linesAdded).toBe(0);
    expect(dataset[0].linesDeleted).toBe(0);
    // (100+100+100+100) / (10+5)
    expect(dataset[0].overlayValue).toBeCloseTo(400 / 15);
  });
});

describe('mountDailyActivityChart', () => {
  it('mounts, updates, and destroys without throwing when items is empty', () => {
    const container = document.createElement('div');
    const handle = mountDailyActivityChart(container, {
      items: [],
      period: 30,
      bucket: 'day',
      mode: 'cost',
      chartColors,
      cardSx,
      isDark: true,
      t,
    });
    expect(() =>
      handle.update({ items: [], period: 7, bucket: 'day', mode: 'tokens', chartColors, cardSx, isDark: false, t }),
    ).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
  });

  it('mounts with non-empty items', () => {
    const container = document.createElement('div');
    const items = [
      {
        date: '2026-01-01',
        sessions: 1,
        commits: 0,
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 200,
        cacheCreationTokens: 100,
        linesAdded: 10,
        linesDeleted: 5,
        estimatedCostUsd: 0.01,
      },
    ] as const;
    const handle = mountDailyActivityChart(container, {
      items,
      period: 30,
      bucket: 'day',
      mode: 'cost',
      chartColors,
      cardSx,
      isDark: true,
      t,
    });
    expect(() =>
      handle.update({ items, period: 90, bucket: 'week', mode: 'tokens', chartColors, cardSx, isDark: true, t }),
    ).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
    expect(container.innerHTML).toBe('');
  });
});

// ---------------------------------------------------------------------------
//  mountReleasesBarChart
// ---------------------------------------------------------------------------

describe('mountReleasesBarChart', () => {
  it('handles empty timeSeries (empty state)', () => {
    const container = document.createElement('div');
    const handle = mountReleasesBarChart(container, {
      timeSeries: [],
      colors,
      cardSx,
      isDark: true,
      t,
    });
    expect(() =>
      handle.update({ timeSeries: [], colors, cardSx, isDark: false, t }),
    ).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
    expect(container.innerHTML).toBe('');
  });

  it('handles non-empty timeSeries', () => {
    const container = document.createElement('div');
    const timeSeries = [
      { bucketStart: '2026-01-01T00:00:00Z', succeeded: 3, failed: 1 },
    ];
    const handle = mountReleasesBarChart(container, {
      timeSeries,
      colors,
      cardSx,
      isDark: true,
      t,
    });
    expect(() =>
      handle.update({ timeSeries, colors, cardSx, isDark: false, t }),
    ).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
    expect(container.innerHTML).toBe('');
  });
});

// ---------------------------------------------------------------------------
//  mountSessionErrorChart
// ---------------------------------------------------------------------------

describe('mountSessionErrorChart', () => {
  it('handles null toolMetrics (zero state)', () => {
    const container = document.createElement('div');
    const handle = mountSessionErrorChart(container, {
      toolMetrics: null,
      colors,
      cardSx,
      isDark: true,
      t,
    });
    expect(() =>
      handle.update({ toolMetrics: null, colors, cardSx, isDark: false, t }),
    ).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
    expect(container.innerHTML).toBe('');
  });

  it('データ 0 件でも「0」テキストではなく固定サイズのチャートを mount する', () => {
    const container = document.createElement('div');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolMetrics: any = { errorsByTool: [], toolUsage: [], skillUsage: [] };
    const handle = mountSessionErrorChart(container, {
      toolMetrics,
      colors,
      cardSx,
      isDark: true,
      t,
    });
    const zeroSpans = [...container.querySelectorAll('span')].filter(
      (s) => s.textContent === '0',
    );
    expect(zeroSpans).toHaveLength(0);
    const chartHost = [...container.querySelectorAll('div')].find(
      (d) => d.style.height === '130px' && d.style.width === '100%',
    );
    expect(chartHost).toBeTruthy();
    handle.destroy();
  });

  it('renders with errorsByTool data', () => {
    const container = document.createElement('div');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolMetrics: any = {
      errorsByTool: [
        { tool: 'Bash', count: 5 },
        { tool: 'Edit', count: 2 },
      ],
      toolUsage: [],
      skillUsage: [],
    };
    const handle = mountSessionErrorChart(container, {
      toolMetrics,
      colors,
      cardSx,
      isDark: true,
      t,
    });
    expect(() =>
      handle.update({ toolMetrics, colors, cardSx, isDark: false, t }),
    ).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
//  mountDayCommitPrefixChart
// ---------------------------------------------------------------------------

describe('mountDayCommitPrefixChart', () => {
  it('コミット 0 件でも「0」テキストではなく固定サイズのチャートを mount する', async () => {
    const container = document.createElement('div');
    const handle = mountDayCommitPrefixChart(container, {
      sessionIds: ['s1'],
      fetchSessionCommits: async () => [],
      colors,
      cardSx,
      isDark: true,
      t,
    });
    // fetch 完了（空配列）まで待つ
    await Promise.resolve();
    await Promise.resolve();
    const zeroSpans = [...container.querySelectorAll('span')].filter(
      (s) => s.textContent === '0',
    );
    expect(zeroSpans).toHaveLength(0);
    const chartHost = [...container.querySelectorAll('div')].find(
      (d) => d.style.height === '130px' && d.style.width === '100%',
    );
    expect(chartHost).toBeTruthy();
    handle.destroy();
  });
});

// ---------------------------------------------------------------------------
//  mountToolUsageChart
// ---------------------------------------------------------------------------

describe('mountToolUsageChart', () => {
  it('handles empty items (no-op)', () => {
    const container = document.createElement('div');
    const handle = mountToolUsageChart(container, {
      items: [],
      chartColors,
      radius: { sm: '4px', md: '8px', lg: '12px' },
      t,
    });
    expect(() =>
      handle.update({ items: [], chartColors, radius: { sm: '4px', md: '8px', lg: '12px' }, t }),
    ).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
  });

  it('renders tool bars for non-empty items', () => {
    const container = document.createElement('div');
    const items = [
      { name: 'Bash', count: 100 },
      { name: 'Edit', count: 50 },
    ];
    const handle = mountToolUsageChart(container, {
      items,
      chartColors,
      radius: { sm: '4px', md: '8px', lg: '12px' },
      t,
    });
    // Should render the title and bars
    expect(container.querySelector('div')).not.toBeNull();
    expect(() =>
      handle.update({ items, chartColors, radius: { sm: '4px', md: '8px', lg: '12px' }, t }),
    ).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
    expect(container.innerHTML).toBe('');
  });
});

// ---------------------------------------------------------------------------
//  mountTurnLaneChart
// ---------------------------------------------------------------------------

describe('mountTurnLaneChart', () => {
  it('handles empty assistantMsgs gracefully', () => {
    const container = document.createElement('div');
    const handle = mountTurnLaneChart(container, {
      assistantMsgs: [],
      tickStep: 1,
      mainAgentLabel: 'Main',
      colors,
    });
    expect(() =>
      handle.update({ assistantMsgs: [], tickStep: 1, mainAgentLabel: 'Main', colors }),
    ).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
  });

  it('mounts with some messages', () => {
    const container = document.createElement('div');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg: any = {
      uuid: 'u1',
      type: 'assistant',
      model: 'claude-sonnet',
      agentId: null,
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
      hasCommit: false,
      hasToolError: false,
    };
    const handle = mountTurnLaneChart(container, {
      assistantMsgs: [msg],
      tickStep: 1,
      commitTurns: [],
      errorTurns: [],
      mainAgentLabel: 'Main',
      colors,
    });
    expect(() =>
      handle.update({ assistantMsgs: [msg], tickStep: 1, commitTurns: [], errorTurns: [], mainAgentLabel: 'Main', colors }),
    ).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
//  mountTurnLaneChartLegend
// ---------------------------------------------------------------------------

describe('mountTurnLaneChartLegend', () => {
  it('mounts and destroys without throwing', () => {
    const container = document.createElement('div');
    const handle = mountTurnLaneChartLegend(container, { assistantMsgs: [] });
    expect(() => handle.update({ assistantMsgs: [] })).not.toThrow();
    expect(() => handle.destroy()).not.toThrow();
    expect(container.innerHTML).toBe('');
  });
});
