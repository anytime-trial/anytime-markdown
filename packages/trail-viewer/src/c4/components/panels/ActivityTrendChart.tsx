import type { TrendPeriod } from '@anytime-markdown/trail-core/c4';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import { useMemo, useState } from 'react';

import { useTrailI18n } from '../../../i18n/context';
import type { ActivityTrendResponse } from '../../hooks/fetchActivityTrendApi';
import { useActivityTrend } from '../../hooks/useActivityTrend';
import { ACTIVITY_TREND_COLORS } from '../../c4MetricColors';
import { AnytimeChartView } from '../../../components/analytics/charts/AnytimeChartView';

const PERIOD_OPTIONS: ReadonlyArray<Exclude<TrendPeriod, 'all'>> = ['7d', '30d', '90d'];

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
  const [period, setPeriod] = useState<TrendPeriod>('30d');

  const enabled = !!elementId;
  const commitTrend = useActivityTrend({
    enabled,
    serverUrl,
    elementId: elementId ?? '',
    period,
    granularity: 'commit',
    repoName,
  });
  const readTrend = useActivityTrend({
    enabled,
    serverUrl,
    elementId: elementId ?? '',
    period,
    granularity: 'session',
    sessionMode: 'read',
    repoName,
  });
  const writeTrend = useActivityTrend({
    enabled,
    serverUrl,
    elementId: elementId ?? '',
    period,
    granularity: 'session',
    sessionMode: 'write',
    repoName,
  });
  const defectTrend = useActivityTrend({
    enabled,
    serverUrl,
    elementId: elementId ?? '',
    period,
    granularity: 'defect',
    repoName,
  });

  const palette = isDark ? ACTIVITY_TREND_COLORS.dark : ACTIVITY_TREND_COLORS.light;

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
      type: s.kind, // 'line' | 'bar'
      color: s.color,
      axis: s.yAxisId,
      values: [...s.data],
    }));
    return {
      kind: 'combo',
      categories: chartProps.xs.map(formatTrendDate),
      series,
      // 凡例は左の自前 Box で描くため chart-core 側は抑制。
      options: { legend: 'none' },
    };
  }, [chartProps]);

  if (!elementId) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1,
        borderTop: 1,
        borderColor: 'divider',
      }}
      role="region"
      aria-label="Activity trend"
    >
      <Typography variant="subtitle2" sx={{ fontSize: '0.8rem' }}>
        {t('c4.trend.title')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'max-content minmax(0, 1fr)' },
          alignItems: 'start',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <FormControl size="small" sx={{ minWidth: 88 }}>
            <InputLabel id="trend-period-label">{t('c4.hotspot.controls.period')}</InputLabel>
            <Select
              labelId="trend-period-label"
              label={t('c4.hotspot.controls.period')}
              value={period}
              onChange={(e) => setPeriod(String(e.target.value) as TrendPeriod)}
            >
              {PERIOD_OPTIONS.map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {chartProps && (
            <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {legendItems.map((item) => (
                <Box
                  component="li"
                  key={item.label}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, listStyle: 'none' }}
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '2px',
                      bgcolor: item.color,
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
                    {item.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          {error && (
            <Typography variant="caption" color="error" role="alert">
              {error.message}
            </Typography>
          )}
          {loading && !chartProps && (
            <Typography variant="caption" color="text.secondary" aria-live="polite">
              {t('c4.trend.loading')}
            </Typography>
          )}
          {spec && (
            <Box sx={{ width: '100%', minHeight: 200 }}>
              <AnytimeChartView spec={spec} height={200} isDark={isDark} />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
