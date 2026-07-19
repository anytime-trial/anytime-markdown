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
import type { BucketUnit, DailyViewMode, PeriodDays } from '../../../components/analytics/types';
import type { ThemeChartColors } from '../../../theme/designTokens';
import { buildDailyActivitySpec } from '../../../components/analytics/charts/specs/buildDailyActivitySpec';
import { mountAnytimeChartView } from '../anytimeChartView';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface DailyActivityChartProps {
  items: AnalyticsData['dailyActivity'];
  period: PeriodDays;
  /** 棒グラフの集計単位。'week' で金曜締めの週集計へ切り替える。 */
  bucket: BucketUnit;
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
  if (!overlay || mode !== 'cost') return new Map<string, number>();
  const map = new Map<string, number>();
  for (const b of overlay.cost) {
    const localDate = toLocalDateKey(b.bucketStart);
    const key = overlay.bucket === 'week' ? toFridayWeekKey(localDate) : localDate;
    map.set(key, b.value);
  }
  return map;
}

/**
 * 右軸 overlay の当日値。tokens は日次データから tok/LOC を算出し、cost は
 * サーバー由来の $/LOC を引く。loc モードは分母が LOC 自身のため overlay を持たない。
 */
function computeOverlayValue(
  d: AnalyticsData['dailyActivity'][number],
  mode: DailyViewMode,
  overlayByDate: Map<string, number>,
  overlayBucket: 'day' | 'week' | undefined,
): number | null {
  if (mode === 'loc') return null;
  if (mode === 'cost') {
    return overlayByDate.get(overlayBucket === 'week' ? toFridayWeekKey(d.date) : d.date) ?? null;
  }
  const grossLoc = d.linesAdded + d.linesDeleted;
  if (grossLoc <= 0) return null;
  return (d.inputTokens + d.outputTokens + d.cacheReadTokens + d.cacheCreationTokens) / grossLoc;
}

/** 表示期間で絞り込み、集計単位に応じて日次 / 週次のデータセットを組み立てる（テスト公開）。 */
export function computeDailyActivityDataset(props: DailyActivityChartProps): ChartEntry[] {
  const { items, period, bucket, mode, costOptimization, overlay } = props;
  const costByDate = computeCostByDate(costOptimization);
  const overlayByDate = computeOverlayByDate(overlay, mode);
  const overlayBucket = overlay?.bucket;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - period);
  const cutoffStr = toLocalDateKey(cutoff.toISOString());
  const filtered = items.filter((d) => d.date >= cutoffStr);
  const isTokens = mode === 'tokens';
  const isCost = mode === 'cost';

  const dailyDataset: ChartEntry[] = filtered.map((d) => {
    const costEntry = costByDate.get(d.date);
    return {
      date: d.date.slice(5),
      fullDate: d.date,
      inputTokens: isTokens ? d.inputTokens : 0,
      outputTokens: isTokens ? d.outputTokens : 0,
      cacheReadTokens: isTokens ? d.cacheReadTokens : 0,
      cacheCreationTokens: isTokens ? d.cacheCreationTokens : 0,
      actualCost: isCost ? (costEntry?.actual ?? d.estimatedCostUsd) : 0,
      skillCost: isCost ? (costEntry?.skill ?? 0) : 0,
      linesAdded: mode === 'loc' ? d.linesAdded : 0,
      linesDeleted: mode === 'loc' ? d.linesDeleted : 0,
      overlayValue: computeOverlayValue(d, mode, overlayByDate, overlayBucket),
    };
  });

  return bucket === 'week' ? groupByWeek(dailyDataset) : dailyDataset;
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

  // 空データでも card は常に mount し、items が非同期到着したら update で描画する。
  // （旧 React は items 空で null を返し、到着時に自動再描画していた。mount 時 no-op スタブを
  //  返すと到着後も永久に空のまま固着する回帰の修正。）
  const card = document.createElement('div');
  container.appendChild(card);
  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;
  let dataset: ChartEntry[] = [];

  function buildSpec(p: DailyActivityChartProps) {
    const dataset = computeDailyActivityDataset(p);
    const isTokens = p.mode === 'tokens';
    // loc モードは overlay を持たない（分母が LOC 自身）。
    const hasOverlay = p.mode !== 'loc' && (isTokens || p.overlay != null);
    const overlayLabel = isTokens ? p.t('chart.tokensPerLoc') : p.t('chart.costPerLoc');
    return {
      spec: buildDailyActivitySpec(dataset, {
        mode: p.mode,
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
          locAdded: p.t('chart.locAdded'),
          locDeleted: p.t('chart.locDeleted'),
        },
      }),
      dataset,
    };
  }

  // dataset を通じて現在値を読む click ハンドラ（週集計時はバケットが単日でないため無効）。
  const onCategoryClick = (idx: number): void => {
    if (idx >= 0 && idx < dataset.length) props.onDateClick?.(dataset[idx].fullDate);
  };

  function render(): void {
    if (props.items.length === 0) {
      // 空: チャートを外し card を装飾しない（旧 React の null 返却相当）。
      if (chartHandle) { chartHandle.destroy(); chartHandle = null; }
      card.replaceChildren();
      card.removeAttribute('style');
      dataset = [];
      return;
    }
    applyCardStyle(card, props.cardSx);
    const { spec, dataset: newDataset } = buildSpec(props);
    dataset = newDataset;
    const cb = props.bucket === 'week' ? undefined : onCategoryClick;
    if (!chartHandle) {
      chartHandle = mountAnytimeChartView(card, { spec, height: 240, isDark: props.isDark, onCategoryClick: cb });
    } else {
      chartHandle.update({ spec, height: 240, isDark: props.isDark, onCategoryClick: cb });
    }
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      chartHandle?.destroy();
      chartHandle = null;
      card.remove();
    },
  };
}
