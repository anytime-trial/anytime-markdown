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

import { mountDailyActivityChart } from '../dailyActivityChart';
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

describe('mountDailyActivityChart', () => {
  it('mounts, updates, and destroys without throwing when items is empty', () => {
    const container = document.createElement('div');
    const handle = mountDailyActivityChart(container, {
      items: [],
      period: 30,
      mode: 'cost',
      chartColors,
      cardSx,
      isDark: true,
      t,
    });
    expect(() =>
      handle.update({ items: [], period: 7, mode: 'tokens', chartColors, cardSx, isDark: false, t }),
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
      mode: 'cost',
      chartColors,
      cardSx,
      isDark: true,
      t,
    });
    expect(() =>
      handle.update({ items, period: 90, mode: 'tokens', chartColors, cardSx, isDark: true, t }),
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
