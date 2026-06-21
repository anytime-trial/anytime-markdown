/**
 * vanilla 版 DailyActivityChart
 * (`components/analytics/charts/DailyActivityChart.tsx` の素 DOM 等価)。
 */
import { toLocalDateKey } from '@anytime-markdown/trail-core/formatDate';
import type { AnalyticsData, CostOptimizationData } from '../../../domain/parser/types';
import {
  groupByWeek,
  toFridayWeekKey,
  type ChartEntry,
} from '../../../domain/analytics/calculators';
import type { DailyViewMode, PeriodDays } from '../../../components/analytics/types';
import type { ThemeChartColors } from '../../../theme/designTokens';
import { buildDailyActivitySpec } from '../../../components/analytics/charts/specs/buildDailyActivitySpec';
import { mountAnytimeChartView } from '../anytimeChartView';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface DailyActivityChartProps {
  items: AnalyticsData['dailyActivity'];
  period: PeriodDays;
  mode: DailyViewMode;
  onDateClick?: (fullDate: string) => void;
  costOptimization?: CostOptimizationData | null;
  overlay?: {
    bucket: 'day' | 'week';
    tokens: ReadonlyArray<{ bucketStart: string; value: number }>;
    cost: ReadonlyArray<{ bucketStart: string; value: number }>;
  } | null;
  chartColors: ThemeChartColors;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  isDark: boolean;
  t: (k: string) => string;
}

function computeCostByDate(
  costOptimization?: CostOptimizationData | null,
): Map<string, { actual: number; skill: number }> {
  const map = new Map<string, { actual: number; skill: number }>();
  if (!costOptimization) return map;
  for (const d of costOptimization.daily) {
    map.set(d.date, { actual: d.actualCost, skill: d.skillCost });
  }
  return map;
}

function computeOverlayByDate(
  overlay: DailyActivityChartProps['overlay'],
  mode: DailyViewMode,
): Map<string, number> {
  if (!overlay || mode === 'tokens') return new Map<string, number>();
  const map = new Map<string, number>();
  for (const b of overlay.cost) {
    const localDate = toLocalDateKey(b.bucketStart);
    const key = overlay.bucket === 'week' ? toFridayWeekKey(localDate) : localDate;
    map.set(key, b.value);
  }
  return map;
}

function computeDataset(props: DailyActivityChartProps): ChartEntry[] {
  const { items, period, mode, costOptimization, overlay } = props;
  const costByDate = computeCostByDate(costOptimization);
  const overlayByDate = computeOverlayByDate(overlay, mode);
  const overlayBucket = overlay?.bucket;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - period);
  const cutoffStr = toLocalDateKey(cutoff.toISOString());
  const filtered = items.filter((d) => d.date >= cutoffStr);
  const isTokens = mode === 'tokens';

  const dailyDataset: ChartEntry[] = filtered.map((d) => {
    const costEntry = costByDate.get(d.date);
    let overlayValue: number | null = null;
    if (isTokens) {
      const grossLoc = d.linesAdded + d.linesDeleted;
      if (grossLoc > 0) {
        overlayValue =
          (d.inputTokens + d.outputTokens + d.cacheReadTokens + d.cacheCreationTokens) / grossLoc;
      }
    } else {
      overlayValue =
        overlayByDate.get(overlayBucket === 'week' ? toFridayWeekKey(d.date) : d.date) ?? null;
    }
    return {
      date: d.date.slice(5),
      fullDate: d.date,
      inputTokens: isTokens ? d.inputTokens : 0,
      outputTokens: isTokens ? d.outputTokens : 0,
      cacheReadTokens: isTokens ? d.cacheReadTokens : 0,
      cacheCreationTokens: isTokens ? d.cacheCreationTokens : 0,
      actualCost: isTokens ? 0 : (costEntry?.actual ?? d.estimatedCostUsd),
      skillCost: isTokens ? 0 : (costEntry?.skill ?? 0),
      overlayValue,
    };
  });

  return period === 90 ? groupByWeek(dailyDataset) : dailyDataset;
}

function applyCardStyle(
  el: HTMLElement,
  cardSx: { bgcolor: string; border: string; borderRadius: string },
): void {
  el.style.backgroundColor = cardSx.bgcolor;
  el.style.border = cardSx.border;
  el.style.borderRadius = cardSx.borderRadius;
  el.style.padding = '16px';
}

export function mountDailyActivityChart(
  container: HTMLElement,
  initial: DailyActivityChartProps,
): VanillaViewHandle<DailyActivityChartProps> {
  let props = initial;

  if (props.items.length === 0) {
    return {
      update(next) { props = next; },
      destroy() {},
    };
  }

  const card = document.createElement('div');
  applyCardStyle(card, props.cardSx);
  container.appendChild(card);

  function buildSpec(p: DailyActivityChartProps) {
    const dataset = computeDataset(p);
    const isTokens = p.mode === 'tokens';
    const hasOverlay = isTokens || p.overlay != null;
    const overlayLabel = isTokens ? p.t('chart.tokensPerLoc') : p.t('chart.costPerLoc');
    return {
      spec: buildDailyActivitySpec(dataset, {
        isTokens,
        hasOverlay,
        overlayLabel,
        colors: p.chartColors,
        barLabels: {
          input: 'Input',
          output: 'Output',
          cacheRead: 'Cache Read',
          cacheWrite: 'Cache Write',
          current: 'Current',
          optimized: 'Optimized',
        },
      }),
      dataset,
    };
  }

  const { spec: initialSpec, dataset: initialDataset } = buildSpec(props);
  let dataset = initialDataset;

  const onCategoryClick =
    props.period === 90
      ? undefined
      : (idx: number) => {
          if (idx >= 0 && idx < dataset.length) props.onDateClick?.(dataset[idx].fullDate);
        };

  const chartHandle = mountAnytimeChartView(card, {
    spec: initialSpec,
    height: 240,
    isDark: props.isDark,
    onCategoryClick,
  });

  return {
    update(next) {
      props = next;
      applyCardStyle(card, next.cardSx);
      const { spec, dataset: newDataset } = buildSpec(next);
      dataset = newDataset;
      const nextOnCategoryClick =
        next.period === 90
          ? undefined
          : (idx: number) => {
              if (idx >= 0 && idx < dataset.length) props.onDateClick?.(dataset[idx].fullDate);
            };
      chartHandle.update({ spec, height: 240, isDark: next.isDark, onCategoryClick: nextOnCategoryClick });
    },
    destroy() {
      chartHandle.destroy();
      card.remove();
    },
  };
}
