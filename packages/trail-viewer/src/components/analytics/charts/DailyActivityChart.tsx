import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import { toLocalDateKey } from '@anytime-markdown/trail-core/formatDate';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { AnalyticsData, CostOptimizationData } from '../../../domain/parser/types';
import {
  groupByWeek,
  toFridayWeekKey,
  type ChartEntry,
} from '../../../domain/analytics/calculators';
import type { DailyViewMode, PeriodDays } from '../types';
import { AnytimeChartView } from './AnytimeChartView';
import { buildDailyActivitySpec } from './specs/buildDailyActivitySpec';

export function DailyActivityChart({
  items,
  period,
  mode,
  onDateClick,
  costOptimization,
  overlay,
}: Readonly<{
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
}>) {
  const { chartColors, cardSx } = useTrailTheme();
  const { t } = useTrailI18n();

  const costByDate = useMemo(() => {
    const map = new Map<string, { actual: number; skill: number }>();
    if (!costOptimization) return map;
    for (const d of costOptimization.daily) {
      map.set(d.date, { actual: d.actualCost, skill: d.skillCost });
    }
    return map;
  }, [costOptimization]);

  const overlayByDate = useMemo(() => {
    // tokens mode: tokensPerLoc is computed directly from items in dataset
    if (!overlay || mode === 'tokens') return new Map<string, number>();
    const map = new Map<string, number>();
    for (const b of overlay.cost) {
      const localDate = toLocalDateKey(b.bucketStart);
      // trail-core buildRatioTimeSeries uses Sunday-anchored weeks; align to Friday
      const key = overlay.bucket === 'week' ? toFridayWeekKey(localDate) : localDate;
      map.set(key, b.value);
    }
    return map;
  }, [overlay, mode]);

  const overlayBucket = overlay?.bucket;
  const dataset = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    const cutoffStr = toLocalDateKey(cutoff.toISOString());
    const filtered = items.filter((d) => d.date >= cutoffStr);
    const isTokens = mode === 'tokens';
    const dailyDataset: ChartEntry[] = filtered.map((d) => {
      const costEntry = costByDate.get(d.date);
      let overlayValue: number | null = null;
      if (isTokens) {
        // Compute tokensPerLoc directly from dailyActivity to match the day card formula
        const grossLoc = d.linesAdded + d.linesDeleted;
        if (grossLoc > 0) {
          overlayValue = (d.inputTokens + d.outputTokens + d.cacheReadTokens + d.cacheCreationTokens) / grossLoc;
        }
      } else {
        overlayValue = overlayByDate.get(overlayBucket === 'week' ? toFridayWeekKey(d.date) : d.date) ?? null;
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
  }, [items, period, mode, costByDate, overlayByDate, overlayBucket]);

  const isTokens = mode === 'tokens';
  // tokens mode always shows tokensPerLoc overlay (computed from items); cost mode needs external overlay
  const hasOverlay = isTokens || overlay != null;
  const overlayLabel = isTokens ? t('chart.tokensPerLoc') : t('chart.costPerLoc');

  const spec = useMemo(
    () =>
      buildDailyActivitySpec(dataset, {
        isTokens,
        hasOverlay,
        overlayLabel,
        colors: chartColors,
        barLabels: { input: 'Input', output: 'Output', cacheRead: 'Cache Read', cacheWrite: 'Cache Write', current: 'Current', optimized: 'Optimized' },
      }),
    [dataset, isTokens, hasOverlay, overlayLabel, chartColors],
  );

  if (items.length === 0) return null;

  // 90日（週次集計）はドリルダウン無効。それ以外は category クリックで日付ドリル。
  const onCategoryClick =
    period === 90
      ? undefined
      : (idx: number) => {
          if (idx >= 0 && idx < dataset.length) onDateClick?.(dataset[idx].fullDate);
        };

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={240} onCategoryClick={onCategoryClick} />
    </Paper>
  );
}
