/**
 * vanilla 版 CommitsCombinedChart
 * (`components/analytics/charts/combined/CommitsCombinedChart.tsx` の素 DOM 等価)。
 */
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import { LEAD_TIME_LOC_COLOR } from '../../../../theme/designTokens';
import type { CommitMetric } from '../../../../components/analytics/types';
import type { CombinedAxisInfo } from '../../../../components/analytics/charts/combined/axisInfo';
import { makeCategoryClick } from '../../../../components/analytics/charts/combined/axisInfo';
import { mountAnytimeChartView } from '../../anytimeChartView';
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';

/** Pure dataset builder — exported so CommitsCombinedChart.tsx re-exports it for tests. */
export function buildCumulativeCommitDataset(args: Readonly<{
  commitPeriods: readonly string[];
  commitLabels: readonly string[];
  commitRows: ReadonlyArray<{ period: string; prefix: string; count: number }>;
  baselinePerCategory: ReadonlyMap<number, number>;
  baselineFix: number;
  baselineTotal: number;
  categoryKeys: readonly number[];
  getCategory: (prefix: string) => number;
}>) {
  const { commitPeriods, commitLabels, commitRows, baselinePerCategory, baselineFix, baselineTotal, categoryKeys, getCategory } = args;
  const incByPeriodCat = new Map<string, number>();
  const totalByPeriod = new Map<string, number>();
  const fixByPeriod = new Map<string, number>();
  for (const r of commitRows) {
    const cat = getCategory(r.prefix);
    incByPeriodCat.set(`${r.period}::${cat}`, (incByPeriodCat.get(`${r.period}::${cat}`) ?? 0) + r.count);
    totalByPeriod.set(r.period, (totalByPeriod.get(r.period) ?? 0) + r.count);
    if (r.prefix === 'fix') {
      fixByPeriod.set(r.period, (fixByPeriod.get(r.period) ?? 0) + r.count);
    }
  }
  const runningPerCat = new Map<number, number>();
  for (const cat of categoryKeys) runningPerCat.set(cat, baselinePerCategory.get(cat) ?? 0);
  let runningFix = baselineFix;
  let runningTotal = baselineTotal;
  return commitPeriods.map((p, pi) => {
    for (const cat of categoryKeys) {
      runningPerCat.set(cat, (runningPerCat.get(cat) ?? 0) + (incByPeriodCat.get(`${p}::${cat}`) ?? 0));
    }
    runningFix += fixByPeriod.get(p) ?? 0;
    runningTotal += totalByPeriod.get(p) ?? 0;
    const row: Record<string, string | number | null> = { period: commitLabels[pi] };
    for (const cat of categoryKeys) row[`c${cat}`] = runningPerCat.get(cat) ?? 0;
    row.fixRate = runningTotal > 0 ? (runningFix / runningTotal) * 100 : null;
    return row;
  });
}

export interface CommitsCombinedChartProps {
  axisInfo: CombinedAxisInfo;
  commitMetric: CommitMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
  isDark: boolean;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  getCategory: (prefix: string) => number;
  getCategoryLabel: (cat: number) => string;
  getCategoryColorByIndex: (cat: number) => string;
  categoryKeys: readonly number[];
}

function buildSpec(p: CommitsCombinedChartProps): ChartSpec {
  const {
    commitRows, commitRowsPreWindow, commitPeriods, commitLabels,
    aiRateRows, commitBaseline,
  } = p.axisInfo;
  const { commitMetric, getCategory, getCategoryLabel, getCategoryColorByIndex, categoryKeys } = p;
  const isCumulative = commitMetric === 'cumulative';

  // Build baseline per category
  const baselinePerCategory = new Map<number, number>();
  for (const cat of categoryKeys) baselinePerCategory.set(cat, 0);
  if (commitBaseline) {
    for (const e of commitBaseline.perPrefix) {
      const cat = getCategory(e.prefix);
      baselinePerCategory.set(cat, (baselinePerCategory.get(cat) ?? 0) + e.count);
    }
  }
  for (const r of commitRowsPreWindow) {
    const cat = getCategory(r.prefix);
    baselinePerCategory.set(cat, (baselinePerCategory.get(cat) ?? 0) + r.count);
  }

  const baselineFix =
    (commitBaseline?.perPrefix.find((e) => e.prefix === 'fix')?.count ?? 0) +
    commitRowsPreWindow.reduce((acc, r) => acc + (r.prefix === 'fix' ? r.count : 0), 0);

  const baselineTotal =
    (commitBaseline?.totalCount ?? 0) +
    commitRowsPreWindow.reduce((acc, r) => acc + r.count, 0);

  const num = (row: Record<string, string | number | null>, key: string): number => {
    const v = row[key];
    return typeof v === 'number' ? v : 0;
  };

  if (isCumulative) {
    const dataset = buildCumulativeCommitDataset({
      commitPeriods,
      commitLabels,
      commitRows,
      baselinePerCategory,
      baselineFix,
      baselineTotal,
      categoryKeys,
      getCategory,
    });
    const areaSeries: Series[] = categoryKeys.map((cat) => ({
      name: getCategoryLabel(cat),
      type: 'area',
      color: getCategoryColorByIndex(cat),
      values: dataset.map((row) => num(row, `c${cat}`)),
    }));
    const fixRate: Series = {
      name: 'fix 比率 (%)',
      type: 'line',
      axis: 'right',
      color: LEAD_TIME_LOC_COLOR,
      connectNulls: true,
      values: dataset.map((row) => (typeof row.fixRate === 'number' ? row.fixRate : null)),
    };
    return {
      kind: 'combo',
      categories: dataset.map((row) => String(row.period)),
      series: [...areaSeries, fixRate],
      options: { stacked: true, legend: 'bottom', yAxisRight: { label: '%' } },
    };
  }

  const showRate = commitMetric === 'count';
  const valMap = new Map<string, number>();
  for (const r of commitRows) {
    const cat = getCategory(r.prefix);
    const key = `${r.period}::${cat}`;
    const value = commitMetric === 'loc' ? (r.linesAdded ?? 0) + (r.linesDeleted ?? 0) : r.count;
    valMap.set(key, (valMap.get(key) ?? 0) + value);
  }
  const commitDataset = commitPeriods.map((p, pi) => {
    const entry: Record<string, string | number> = { period: commitLabels[pi] };
    for (const cat of categoryKeys) {
      entry[`c${cat}`] = valMap.get(`${p}::${cat}`) ?? 0;
    }
    return entry;
  });

  const rateByPeriod = new Map<string, number | null>();
  if (showRate) {
    for (const r of aiRateRows) rateByPeriod.set(r.period, r.sampleSize > 0 ? r.rate : null);
  }

  const barSeries: Series[] = categoryKeys.map((cat) => ({
    name: getCategoryLabel(cat),
    type: 'bar',
    color: getCategoryColorByIndex(cat),
    values: commitDataset.map((row) => num(row, `c${cat}`)),
  }));
  const lineSeries: Series[] = showRate
    ? [{
        name: 'AI 1 発成功率 (%)',
        type: 'line',
        axis: 'right',
        color: LEAD_TIME_LOC_COLOR,
        connectNulls: true,
        values: commitDataset.map((_row, i) => rateByPeriod.get(commitPeriods[i]) ?? null),
      }]
    : [];

  return {
    kind: 'combo',
    categories: commitDataset.map((row) => String(row.period)),
    series: [...barSeries, ...lineSeries],
    options: { stacked: true, legend: 'bottom', ...(showRate ? { yAxisRight: { label: '%' } } : {}) },
  };
}

function applyCardStyle(card: HTMLElement, cardSx: { bgcolor: string; border: string; borderRadius: string }): void {
  card.style.backgroundColor = cardSx.bgcolor;
  card.style.border = cardSx.border;
  card.style.borderRadius = cardSx.borderRadius;
  card.style.padding = '16px';
}

export function mountCommitsCombinedChart(
  container: HTMLElement,
  initial: CommitsCombinedChartProps,
): VanillaViewHandle<CommitsCombinedChartProps> {
  let props = initial;

  const card = document.createElement('div');
  container.appendChild(card);

  const emptyEl = document.createElement('p');
  emptyEl.style.cssText = 'margin:0;font-size:0.875rem;color:var(--am-color-text-secondary);';
  emptyEl.textContent = '0';

  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;

  function isEmpty(p: CommitsCombinedChartProps): boolean {
    const isCumulative = p.commitMetric === 'cumulative';
    return (
      p.axisInfo.commitPrefixes.length === 0 &&
      (!isCumulative || (p.axisInfo.commitBaseline?.totalCount ?? 0) === 0)
    );
  }

  function render(p: CommitsCombinedChartProps): void {
    if (isEmpty(p)) {
      // 空状態は旧 React 同様、カード枠なしの素テキスト（0）で表示する。
      chartHandle?.destroy();
      chartHandle = null;
      card.removeAttribute('style');
      card.replaceChildren(emptyEl);
      return;
    }
    applyCardStyle(card, p.cardSx);
    if (emptyEl.isConnected) emptyEl.remove();
    if (!chartHandle) {
      chartHandle = mountAnytimeChartView(card, {
        spec: buildSpec(p),
        height: 260,
        isDark: p.isDark,
        onCategoryClick: makeCategoryClick(p.axisInfo.commitPeriods, p.canDrill, p.onDateClick),
      });
    } else {
      chartHandle.update({
        spec: buildSpec(p),
        height: 260,
        isDark: p.isDark,
        onCategoryClick: makeCategoryClick(p.axisInfo.commitPeriods, p.canDrill, p.onDateClick),
      });
    }
  }

  render(props);

  return {
    update(next) {
      props = next;
      render(next);
    },
    destroy() {
      chartHandle?.destroy();
      card.remove();
    },
  };
}
