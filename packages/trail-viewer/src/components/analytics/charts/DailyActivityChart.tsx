import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import { BarPlot } from '@mui/x-charts/BarChart';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { ChartsDataProvider } from '@mui/x-charts/ChartsDataProvider';
import { ChartsSurface } from '@mui/x-charts/ChartsSurface';
import { ChartsWrapper } from '@mui/x-charts/ChartsWrapper';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { ChartsTooltip } from '@mui/x-charts/ChartsTooltip';
import { ChartsGrid } from '@mui/x-charts/ChartsGrid';
import { ChartsLegend } from '@mui/x-charts/ChartsLegend';
import { ChartsAxisHighlight } from '@mui/x-charts/ChartsAxisHighlight';
import { toLocalDateKey } from '@anytime-markdown/trail-core/formatDate';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { AnalyticsData, CostOptimizationData } from '../../../domain/parser/types';
import {
  groupByWeek,
  toFridayWeekKey,
  type ChartEntry,
} from '../../../domain/analytics/calculators';
import { fmtTokens, fmtUsdShort } from '../../../domain/analytics/formatters';
import type { DailyViewMode, PeriodDays } from '../types';

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

  if (items.length === 0) return null;

  const isTokens = mode === 'tokens';
  const yFormatter = isTokens ? fmtTokens : fmtUsdShort;
  const seriesFormatter = (v: number | null) => (v == null || v === 0 ? null : yFormatter(v));
  // tokens mode always shows tokensPerLoc overlay (computed from items); cost mode needs external overlay
  const hasOverlay = isTokens || overlay != null;
  const overlayLabel = isTokens ? t('chart.tokensPerLoc') : t('chart.costPerLoc');
  const overlayFormatter = (v: number | null) => {
    if (v == null) return null;
    if (isTokens) return `${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)} tok/LOC`;
    return v >= 0.01 ? `$${v.toFixed(4)}/LOC` : `¢${(v * 100).toFixed(2)}/LOC`;
  };
  const rightAxisFormatter = (v: number) => {
    if (isTokens) return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
    return v >= 0.01 ? `$${v.toFixed(2)}` : `¢${(v * 100).toFixed(1)}`;
  };

  const handleAxisClick = (_event: MouseEvent, data: { dataIndex: number } | null) => {
    const idx = data?.dataIndex;
    if (idx == null || idx < 0 || idx >= dataset.length) return;
    onDateClick?.(dataset[idx].fullDate);
  };

  const barSeries = isTokens ? [
    { type: 'bar' as const, dataKey: 'inputTokens', label: 'Input', stack: 'a', color: chartColors.input, yAxisId: 'left', valueFormatter: seriesFormatter },
    { type: 'bar' as const, dataKey: 'outputTokens', label: 'Output', stack: 'a', color: chartColors.output, yAxisId: 'left', valueFormatter: seriesFormatter },
    { type: 'bar' as const, dataKey: 'cacheReadTokens', label: 'Cache Read', stack: 'a', color: chartColors.cacheRead, yAxisId: 'left', valueFormatter: seriesFormatter },
    { type: 'bar' as const, dataKey: 'cacheCreationTokens', label: 'Cache Write', stack: 'a', color: chartColors.cacheWrite, yAxisId: 'left', valueFormatter: seriesFormatter },
  ] : [
    { type: 'bar' as const, dataKey: 'actualCost', label: 'Current', color: chartColors.primary, yAxisId: 'left', valueFormatter: seriesFormatter },
    { type: 'bar' as const, dataKey: 'skillCost', label: 'Optimized', color: chartColors.skill, yAxisId: 'left', valueFormatter: seriesFormatter },
  ];

  const overlaySeries = hasOverlay ? [{
    type: 'line' as const,
    dataKey: 'overlayValue',
    label: overlayLabel,
    color: chartColors.overlayPerLoc,
    yAxisId: 'right',
    connectNulls: true,
    showMark: true,
    valueFormatter: overlayFormatter,
  }] : [];

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <ChartsDataProvider
        dataset={dataset}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series={[...barSeries, ...overlaySeries] as any}
        xAxis={[{ id: 'date', scaleType: 'band', dataKey: 'date' }]}
        yAxis={[
          { id: 'left', valueFormatter: yFormatter },
          { id: 'right', position: 'right', valueFormatter: rightAxisFormatter },
        ]}
        height={240}
        margin={{ left: 16, right: hasOverlay ? 56 : 8, top: 8, bottom: 40 }}
        onAxisClick={period === 90 ? undefined : handleAxisClick}
      >
        <ChartsWrapper legendDirection="horizontal" legendPosition={{ vertical: 'bottom', horizontal: 'center' }}>
          <ChartsLegend />
          <ChartsSurface>
            <ChartsGrid horizontal />
            <BarPlot />
            {hasOverlay && <LinePlot />}
            {hasOverlay && <MarkPlot />}
            <ChartsAxisHighlight x="band" />
            <ChartsXAxis axisId="date" />
            <ChartsYAxis axisId="left" />
            {hasOverlay && <ChartsYAxis axisId="right" />}
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsWrapper>
      </ChartsDataProvider>
    </Paper>
  );
}
