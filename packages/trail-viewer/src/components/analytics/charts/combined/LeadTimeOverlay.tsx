import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import { useTrailTheme } from '../../../TrailThemeContext';
import { capTopN } from '../../../../domain/analytics/calculators';
import { LEAD_TIME_LOC_COLOR } from '../../../../theme/designTokens';
import { AnytimeChartView } from '../AnytimeChartView';

export function LeadTimeOverlay({
  leadTimeOverlay,
  canDrill,
  onDateClick,
}: Readonly<{
  leadTimeOverlay: {
    leadTimePerLoc: ReadonlyArray<{ bucketStart: string; value: number }>;
    unmapped: ReadonlyArray<{ bucketStart: string; value: number }>;
    byPrefix: {
      prefixes: ReadonlyArray<string>;
      series: ReadonlyArray<{ bucketStart: string; byPrefix: Readonly<Record<string, number>> }>;
    };
  } | null;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, toolPalette } = useTrailTheme();

  const ratioRows = leadTimeOverlay?.leadTimePerLoc ?? [];
  const byPrefixSeries = leadTimeOverlay?.byPrefix.series ?? [];
  const allPrefixes = leadTimeOverlay?.byPrefix.prefixes ?? [];

  const { spec, fullDates } = useMemo(() => {
    const ltTotals = new Map<string, number>();
    for (const row of byPrefixSeries) {
      for (const [p, v] of Object.entries(row.byPrefix)) ltTotals.set(p, (ltTotals.get(p) ?? 0) + v);
    }
    const ltCap = capTopN(ltTotals);
    const ltPrefixes = ltCap.displayKeys;
    const ltMap = ltCap.keyMap;

    const bucketKeys = [...new Set([
      ...byPrefixSeries.map((r) => r.bucketStart),
      ...ratioRows.map((r) => r.bucketStart),
    ])].sort();
    const ratioByBucket = new Map(ratioRows.map((r) => [r.bucketStart, r.value]));
    const prefixRowByBucket = new Map(byPrefixSeries.map((r) => [r.bucketStart, r.byPrefix]));
    const dates = bucketKeys.map((b) => b.slice(0, 10));
    const labels = bucketKeys.map((b) => b.slice(5, 10));

    const aggByBucket = bucketKeys.map((b) => {
      const byPrefix = prefixRowByBucket.get(b) ?? {};
      const aggregated: Record<string, number> = {};
      for (const p of ltPrefixes) aggregated[p] = 0;
      for (const origPrefix of allPrefixes) {
        const displayKey = ltMap.get(origPrefix) ?? origPrefix;
        aggregated[displayKey] = (aggregated[displayKey] ?? 0) + (byPrefix[origPrefix] ?? 0);
      }
      return aggregated;
    });

    const barSeries: Series[] = ltPrefixes.map((prefix, i) => ({
      name: prefix,
      type: 'bar',
      color: toolPalette[i % toolPalette.length],
      values: aggByBucket.map((agg) => agg[prefix] ?? 0),
    }));
    const lineSeries: Series[] = [{
      name: 'Lead Time / LOC (min/LOC)',
      type: 'line',
      axis: 'right',
      color: LEAD_TIME_LOC_COLOR,
      connectNulls: true,
      values: bucketKeys.map((b) => ratioByBucket.get(b) ?? null),
    }];
    const built: ChartSpec = {
      kind: 'combo',
      categories: labels,
      series: [...barSeries, ...lineSeries],
      options: { stacked: true, yAxis: { label: 'min' }, yAxisRight: { label: 'min/LOC' } },
    };
    return { spec: built, fullDates: dates };
  }, [byPrefixSeries, ratioRows, allPrefixes, toolPalette]);

  if (byPrefixSeries.length === 0 && ratioRows.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  const onCategoryClick = canDrill
    ? (idx: number) => {
        if (idx >= 0 && idx < fullDates.length) onDateClick?.(fullDates[idx]);
      }
    : undefined;

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={260} onCategoryClick={onCategoryClick} />
    </Paper>
  );
}
