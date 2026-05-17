import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import { buildStackedChartData } from './pipelineChartData';
import type { MemoryPipelineRunStatsByDayRow } from '../../data/types';

export interface PipelineRunsTimelineProps {
  readonly rows: readonly MemoryPipelineRunStatsByDayRow[];
}

// scope ごとに HSL の hue をずらして安定色を返す。テーマには依存しないが
// MUI チャート上で十分な区別がつくよう彩度・明度は固定。
function scopeColor(scope: string): string {
  let hash = 0;
  for (let i = 0; i < scope.length; i++) hash = (hash * 31 + scope.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

export function PipelineRunsTimeline({ rows }: Readonly<PipelineRunsTimelineProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();
  const theme = useTheme();

  const { xLabels, series } = useMemo(() => buildStackedChartData(rows), [rows]);

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('memory.runs.empty')}</Typography>
      </Box>
    );
  }

  const chartSeries = series.map((s) => ({
    label: s.scope,
    data: [...s.data],
    stack: 'duration',
    color: scopeColor(s.scope),
    valueFormatter: (v: number | null) => `${v?.toFixed(0) ?? '—'}s`,
  }));

  return (
    <Box sx={{ height: 160, px: 1 }} aria-label={t('memory.runs.timeline')}>
      <BarChart
        xAxis={[{ scaleType: 'band', data: [...xLabels], tickLabelStyle: { fontSize: 9 } }]}
        yAxis={[{ label: 'sec', labelStyle: { fontSize: 9 } }]}
        series={chartSeries}
        height={150}
        margin={{ top: 8, bottom: 30, left: 36, right: 8 }}
        slotProps={{ legend: { sx: { fontSize: 9, color: theme.palette.text.secondary } } }}
      />
    </Box>
  );
}
