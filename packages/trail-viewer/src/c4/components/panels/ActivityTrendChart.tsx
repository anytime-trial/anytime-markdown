import type { TrendPeriod } from '@anytime-markdown/trail-core/c4';
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import { useMemo, useState } from 'react';

import { useTrailI18n } from '../../../i18n/context';
import type { ActivityTrendResponse } from '../../hooks/fetchActivityTrendApi';
import { useActivityTrend } from '../../hooks/useActivityTrend';
import { ACTIVITY_TREND_COLORS } from '../../c4MetricColors';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountActivityTrendPanel, type ActivityTrendPanelProps } from '../../../views/c4/panels/activityTrendPanel';

function formatTrendDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(parsed);
}

type ActivityTrendSeries = {
  readonly xs: readonly string[];
  readonly series: ReadonlyArray<{
    readonly key: 'commit' | 'read' | 'write' | 'defect';
    readonly kind: 'line' | 'bar';
    readonly data: readonly number[];
    readonly label: string;
    readonly color: string;
    readonly yAxisId?: 'left' | 'right';
  }>;
};

export function buildActivityTrendSeries(
  commitData: ActivityTrendResponse | null,
  readData: ActivityTrendResponse | null,
  writeData: ActivityTrendResponse | null,
  defectData: ActivityTrendResponse | null,
  labels: Readonly<{ commit: string; read: string; write: string; defect: string }>,
  palette: Readonly<{ commit: string; read: string; write: string; defect: string }>,
): ActivityTrendSeries | null {
  if (!commitData || !readData || !writeData || !defectData) return null;
  if (
    commitData.type !== 'single-series'
    || readData.type !== 'single-series'
    || writeData.type !== 'single-series'
    || defectData.type !== 'single-series'
  ) return null;

  const xs = commitData.buckets.map((b) => b.date);
  const readByDate = new Map(readData.buckets.map((b) => [b.date, b.count] as const));
  const writeByDate = new Map(writeData.buckets.map((b) => [b.date, b.count] as const));
  const defectByDate = new Map(defectData.buckets.map((b) => [b.date, b.count] as const));

  return {
    xs,
    series: [
      {
        key: 'commit',
        kind: 'line',
        data: commitData.buckets.map((b) => b.count),
        label: labels.commit,
        color: palette.commit,
        yAxisId: 'left',
      },
      {
        key: 'read',
        kind: 'line',
        data: xs.map((date) => readByDate.get(date) ?? 0),
        label: labels.read,
        color: palette.read,
        yAxisId: 'left',
      },
      {
        key: 'write',
        kind: 'line',
        data: xs.map((date) => writeByDate.get(date) ?? 0),
        label: labels.write,
        color: palette.write,
        yAxisId: 'left',
      },
      {
        key: 'defect',
        kind: 'bar',
        data: xs.map((date) => defectByDate.get(date) ?? 0),
        label: labels.defect,
        color: palette.defect,
        yAxisId: 'right',
      },
    ],
  };
}

export interface ActivityTrendChartProps {
  readonly elementId: string | null;
  readonly serverUrl: string | undefined;
  readonly repoName?: string;
  readonly isDark?: boolean;
}

export function ActivityTrendChart({
  elementId,
  serverUrl,
  repoName,
  isDark = false,
}: Readonly<ActivityTrendChartProps>) {
  const { t } = useTrailI18n();
  const [period, setPeriod] = useState<string>('30d');

  const enabled = !!elementId;
  const commitTrend = useActivityTrend({
    enabled,
    serverUrl,
    elementId: elementId ?? '',
    period: period as TrendPeriod,
    granularity: 'commit',
    repoName,
  });
  const readTrend = useActivityTrend({
    enabled,
    serverUrl,
    elementId: elementId ?? '',
    period: period as TrendPeriod,
    granularity: 'session',
    sessionMode: 'read',
    repoName,
  });
  const writeTrend = useActivityTrend({
    enabled,
    serverUrl,
    elementId: elementId ?? '',
    period: period as TrendPeriod,
    granularity: 'session',
    sessionMode: 'write',
    repoName,
  });
  const defectTrend = useActivityTrend({
    enabled,
    serverUrl,
    elementId: elementId ?? '',
    period: period as TrendPeriod,
    granularity: 'defect',
    repoName,
  });

  const palette = isDark ? ACTIVITY_TREND_COLORS.dark : ACTIVITY_TREND_COLORS.light;
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const chartProps = useMemo(() => {
    return buildActivityTrendSeries(
      commitTrend.data,
      readTrend.data,
      writeTrend.data,
      defectTrend.data,
      {
        commit: t('c4.trend.seriesCommit'),
        read: t('c4.trend.seriesRead'),
        write: t('c4.trend.seriesWrite'),
        defect: t('c4.trend.seriesDefect'),
      },
      palette,
    );
  }, [commitTrend.data, readTrend.data, writeTrend.data, defectTrend.data, palette, t]);

  const error = commitTrend.error ?? readTrend.error ?? writeTrend.error ?? defectTrend.error;
  const loading = commitTrend.loading || readTrend.loading || writeTrend.loading || defectTrend.loading;
  const legendItems = chartProps?.series ?? [];
  const spec = useMemo<ChartSpec | null>(() => {
    if (!chartProps) return null;
    const series: Series[] = chartProps.series.map((s) => ({
      name: s.label,
      type: s.kind,
      color: s.color,
      axis: s.yAxisId,
      values: [...s.data],
    }));
    return {
      kind: 'combo',
      categories: chartProps.xs.map(formatTrendDate),
      series,
      options: { legend: 'none' },
    };
  }, [chartProps]);

  if (!elementId) return null;

  const viewProps: ActivityTrendPanelProps = {
    elementId,
    period,
    onPeriodChange: setPeriod,
    spec,
    legendItems,
    loading,
    error: error?.message ?? null,
    isDark,
    t: tStr,
  };

  return <VanillaIsland mount={mountActivityTrendPanel} props={viewProps} />;
}
