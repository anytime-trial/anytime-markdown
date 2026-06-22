/**
 * vanilla combined chart mounts のスモークテスト。
 * jsdom 環境では `<anytime-chart>` WC は定義されないため、chart internals は検証しない。
 * mount して update / destroy が例外なく完走することを確認する。
 */
import { mountAgentsCombinedChart } from '../combined/agentsCombinedChart';
import { mountModelsCombinedChart } from '../combined/modelsCombinedChart';
import { mountReposCombinedChart } from '../combined/reposCombinedChart';
import { mountSkillsCombinedChart } from '../combined/skillsCombinedChart';
import { mountToolsCombinedChart } from '../combined/toolsCombinedChart';
import { mountErrorToolsCombinedChart } from '../combined/errorToolsCombinedChart';
import { mountCommitsCombinedChart, buildCumulativeCommitDataset } from '../combined/commitsCombinedChart';
import { mountLeadTimeOverlay } from '../combined/leadTimeOverlay';
import { mountCombinedChartsContent } from '../combined/combinedChartsContent';
import { mountChartTitle } from '../shared/chartTitle';
import type { CombinedAxisInfo } from '../../../../components/analytics/charts/combined/axisInfo';

// ---------------------------------------------------------------------------
//  Shared fixtures
// ---------------------------------------------------------------------------

const CARD_SX = { bgcolor: '#121212', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px' };
const TOOL_PALETTE = ['#66BB6A', '#90CAF9', '#FFD54F'];
const t = (key: string): string => key;

// Minimal CombinedAxisInfo for tests (only the fields each chart uses)
function makeAxisInfo() {
  return {
    // tools / error / skills shared
    toolRows: [],
    errorRows: [],
    skillRows: [],
    allPeriods: [],
    labels: [],
    qualityRates: [],
    // models
    modelRows: [],
    modelPeriods: [],
    modelLabels: [],
    models: [],
    modelMap: new Map<string, string>(),
    modelMissingByDisplay: new Map<string, { total: number; missing: number }>(),
    // agents
    agentRows: [],
    agentPeriods: [],
    agentLabels: [],
    agents: [],
    agentMap: new Map<string, string>(),
    agentMissingByDisplay: new Map<string, { total: number; missing: number }>(),
    // commits
    commitRows: [],
    commitRowsPreWindow: [],
    commitPeriods: [],
    commitLabels: [],
    commitPrefixes: [],
    commitMap: new Map<string, string>(),
    commitBaseline: undefined,
    aiRateRows: [],
    commitRegressionByPeriod: [],
    // repos
    repoRows: [],
    repoPeriods: [],
    repoLabels: [],
    repos: [],
    repoMap: new Map<string, string>(),
    // other axisInfo fields
    toolMap: new Map<string, string>(),
    errTools: [],
    errMap: new Map<string, string>(),
    skills: [],
    skillMap: new Map<string, string>(),
    toolMissingByDisplay: new Map<string, { total: number; missing: number }>(),
    tools: [],
  };
}

const axisInfo = makeAxisInfo() as unknown as CombinedAxisInfo;

const CATEGORY_FUNCS = {
  getToolCategory: () => 0,
  getToolCategoryLabel: (cat: number) => `cat-${cat}`,
  getToolCategoryColorByIndex: () => '#ccc',
  toolCategoryKeys: [0, 1, 2, 3, 4] as readonly number[],
};

const SKILL_FUNCS = {
  getSkillCategory: () => 0,
  getSkillCategoryLabel: (cat: number) => `scat-${cat}`,
  getSkillCategoryColorByIndex: () => '#ccc',
  skillCategoryKeys: [0, 1, 2, 3, 4] as readonly number[],
};

const COMMIT_FUNCS = {
  getCategory: () => 0,
  getCategoryLabel: (cat: number) => `ccat-${cat}`,
  getCategoryColorByIndex: () => '#ccc',
  categoryKeys: [0, 1, 2] as readonly number[],
};

function makeDiv(): HTMLDivElement {
  return document.createElement('div');
}

// ---------------------------------------------------------------------------
//  ChartTitle
// ---------------------------------------------------------------------------

describe('mountChartTitle', () => {
  it('mounts without title, updates, destroys', () => {
    const c = makeDiv();
    const h = mountChartTitle(c, { title: 'Hello' });
    expect(c.textContent).toContain('Hello');
    h.update({ title: 'World' });
    expect(c.textContent).toContain('World');
    h.destroy();
    expect(c.children).toHaveLength(0);
  });

  it('mounts with description (help icon branch)', () => {
    const c = makeDiv();
    const h = mountChartTitle(c, { title: 'T', description: 'desc text' });
    h.update({ title: 'T2', description: undefined });
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
//  mountAgentsCombinedChart
// ---------------------------------------------------------------------------

describe('mountAgentsCombinedChart', () => {
  it('mounts, update, destroy without throwing', () => {
    const c = makeDiv();
    const h = mountAgentsCombinedChart(c, {
      axisInfo, agentMetric: 'tokens', canDrill: false,
      isDark: true, toolPalette: TOOL_PALETTE, cardSx: CARD_SX, t,
    });
    h.update({ axisInfo, agentMetric: 'cost', canDrill: false, isDark: false, toolPalette: TOOL_PALETTE, cardSx: CARD_SX, t });
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
//  mountModelsCombinedChart
// ---------------------------------------------------------------------------

describe('mountModelsCombinedChart', () => {
  it('mounts empty state (models.length === 0)', () => {
    const c = makeDiv();
    const h = mountModelsCombinedChart(c, {
      axisInfo, modelMetric: 'count', canDrill: false,
      isDark: true, toolPalette: TOOL_PALETTE, cardSx: CARD_SX, t,
    });
    // empty state: card children should contain emptyEl
    expect(c.querySelector('p')?.textContent).toBe('0');
    h.update({ axisInfo, modelMetric: 'tokens', canDrill: false, isDark: false, toolPalette: TOOL_PALETTE, cardSx: CARD_SX, t });
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
//  mountReposCombinedChart
// ---------------------------------------------------------------------------

describe('mountReposCombinedChart', () => {
  it('mounts, update, destroy without throwing', () => {
    const c = makeDiv();
    const h = mountReposCombinedChart(c, {
      axisInfo, repoMetric: 'count', canDrill: true,
      isDark: false, toolPalette: TOOL_PALETTE, cardSx: CARD_SX,
    });
    h.update({ axisInfo, repoMetric: 'tokens', canDrill: false, isDark: true, toolPalette: TOOL_PALETTE, cardSx: CARD_SX });
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
//  mountSkillsCombinedChart
// ---------------------------------------------------------------------------

describe('mountSkillsCombinedChart', () => {
  it('mounts, update, destroy without throwing', () => {
    const c = makeDiv();
    const h = mountSkillsCombinedChart(c, {
      axisInfo, canDrill: false, isDark: true, cardSx: CARD_SX, ...SKILL_FUNCS,
    });
    h.update({ axisInfo, canDrill: true, isDark: false, cardSx: CARD_SX, ...SKILL_FUNCS });
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
//  mountToolsCombinedChart
// ---------------------------------------------------------------------------

describe('mountToolsCombinedChart', () => {
  it('mounts, update, destroy without throwing', () => {
    const c = makeDiv();
    const h = mountToolsCombinedChart(c, {
      axisInfo, toolMetric: 'count', canDrill: false, isDark: true, cardSx: CARD_SX, ...CATEGORY_FUNCS,
    });
    h.update({ axisInfo, toolMetric: 'tokens', canDrill: false, isDark: false, cardSx: CARD_SX, ...CATEGORY_FUNCS });
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
//  mountErrorToolsCombinedChart
// ---------------------------------------------------------------------------

describe('mountErrorToolsCombinedChart', () => {
  it('mounts empty when no errorRows or rates', () => {
    const c = makeDiv();
    const h = mountErrorToolsCombinedChart(c, {
      axisInfo, canDrill: false, isDark: true, cardSx: CARD_SX, ...CATEGORY_FUNCS,
    });
    expect(c.querySelector('p')?.textContent).toBe('0');
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
//  mountCommitsCombinedChart
// ---------------------------------------------------------------------------

describe('mountCommitsCombinedChart', () => {
  it('mounts, update, destroy without throwing', () => {
    const c = makeDiv();
    const h = mountCommitsCombinedChart(c, {
      axisInfo, commitMetric: 'count', canDrill: false, isDark: true, cardSx: CARD_SX, ...COMMIT_FUNCS,
    });
    h.update({ axisInfo, commitMetric: 'cumulative', canDrill: false, isDark: false, cardSx: CARD_SX, ...COMMIT_FUNCS });
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
//  buildCumulativeCommitDataset (re-exported from vanilla view)
// ---------------------------------------------------------------------------

describe('buildCumulativeCommitDataset (re-exported)', () => {
  it('accumulates and returns fixRate', () => {
    const dataset = buildCumulativeCommitDataset({
      commitPeriods: ['2026-05-10', '2026-05-11'],
      commitLabels: ['05-10', '05-11'],
      commitRows: [
        { period: '2026-05-10', prefix: 'feat', count: 2 },
        { period: '2026-05-10', prefix: 'fix', count: 1 },
      ],
      baselinePerCategory: new Map([[0, 0], [1, 0], [2, 0]]),
      baselineFix: 0,
      baselineTotal: 0,
      categoryKeys: [0, 1, 2],
      getCategory: (prefix) => prefix === 'feat' ? 0 : prefix === 'fix' ? 1 : 2,
    });
    expect(dataset[0]!.c0).toBe(2);
    expect(dataset[0]!.c1).toBe(1);
    expect((dataset[0]!.fixRate as number)).toBeCloseTo(33.333, 2);
    // period 2 has no new commits — values should match period 1
    expect(dataset[1]!.c0).toBe(2);
    expect(dataset[1]!.c1).toBe(1);
  });
});

// ---------------------------------------------------------------------------
//  mountLeadTimeOverlay
// ---------------------------------------------------------------------------

describe('mountLeadTimeOverlay', () => {
  it('mounts empty when overlay is null', () => {
    const c = makeDiv();
    const h = mountLeadTimeOverlay(c, {
      leadTimeOverlay: null, canDrill: false, isDark: true,
      toolPalette: TOOL_PALETTE, cardSx: CARD_SX,
    });
    expect(c.querySelector('p')?.textContent).toBe('0');
    h.destroy();
  });

  it('mounts, update, destroy without throwing', () => {
    const c = makeDiv();
    const overlay = {
      leadTimePerLoc: [],
      unmapped: [],
      byPrefix: { prefixes: [], series: [] },
    };
    const h = mountLeadTimeOverlay(c, {
      leadTimeOverlay: overlay, canDrill: true, isDark: true,
      toolPalette: TOOL_PALETTE, cardSx: CARD_SX,
    });
    h.update({ leadTimeOverlay: null, canDrill: false, isDark: false, toolPalette: TOOL_PALETTE, cardSx: CARD_SX });
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
//  mountCombinedChartsContent
// ---------------------------------------------------------------------------

describe('mountCombinedChartsContent', () => {
  const theme = {
    isDark: true, toolPalette: TOOL_PALETTE, cardSx: CARD_SX, t,
    ...CATEGORY_FUNCS,
    ...SKILL_FUNCS,
    ...COMMIT_FUNCS,
  };

  it('renders nothing when data is null', () => {
    const c = makeDiv();
    const h = mountCombinedChartsContent(c, {
      data: null, periodDays: 30, activeChart: 'models',
      toolMetric: 'count', modelMetric: 'count', agentMetric: 'tokens',
      commitMetric: 'count', repoMetric: 'count', leadTimeOverlay: null, theme,
    });
    expect(c.children).toHaveLength(0);
    h.destroy();
  });

  it('switches activeChart from models → tools without throwing', () => {
    const c = makeDiv();
    const minimalData = {
      toolCounts: [],
      errorRate: [],
      skillStats: [],
      modelStats: [],
      agentStats: [],
      commitPrefixStats: [],
      repoStats: [],
      aiFirstTryRate: [],
      qualityRates: [],
      commitBaseline: undefined,
      commitRegressionByPeriod: [],
    };
    const base = {
      data: minimalData as unknown as Parameters<typeof mountCombinedChartsContent>[1]['data'],
      periodDays: 30 as const,
      toolMetric: 'count' as const,
      modelMetric: 'count' as const,
      agentMetric: 'tokens' as const,
      commitMetric: 'count' as const,
      repoMetric: 'count' as const,
      leadTimeOverlay: null,
      theme,
    };
    const h = mountCombinedChartsContent(c, { ...base, activeChart: 'models' });
    h.update({ ...base, activeChart: 'tools' });
    h.update({ ...base, activeChart: 'tools', toolMetric: 'error' as const });
    h.update({ ...base, activeChart: 'repos' });
    h.update({ ...base, activeChart: 'skills' });
    h.update({ ...base, activeChart: 'agents' });
    h.update({ ...base, activeChart: 'commits' });
    h.update({ ...base, activeChart: 'commits', commitMetric: 'leadTime' as const });
    h.destroy();
  });
});
