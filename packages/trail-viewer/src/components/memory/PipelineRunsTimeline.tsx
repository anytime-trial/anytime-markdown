import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import { buildPipelineChartBars } from './pipelineChartData';
import type { MemoryPipelineRunRow } from '../../data/types';

function statusColor(status: string, theme: { palette: { success: { main: string }; warning: { main: string }; error: { main: string }; info: { main: string } } }): string {
  switch (status) {
    case 'success': return theme.palette.success.main;
    case 'partial': return theme.palette.warning.main;
    case 'error': return theme.palette.error.main;
    default: return theme.palette.info.main;
  }
}

export interface PipelineRunsTimelineProps {
  readonly runs: readonly MemoryPipelineRunRow[];
}

export function PipelineRunsTimeline({ runs }: Readonly<PipelineRunsTimelineProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();
  const theme = useTheme();

  if (runs.length === 0) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('memory.runs.empty')}</Typography>
      </Box>
    );
  }

  const bars = buildPipelineChartBars(runs);
  const xLabels = bars.map((b) => b.startedAt.slice(0, 10));
  const durations = bars.map((b) => b.durationMs / 1000);
  const barColors = bars.map((b) => statusColor(b.status, theme));

  return (
    <Box sx={{ height: 160, px: 1 }} aria-label={t('memory.runs.timeline')}>
      <BarChart
        xAxis={[{ scaleType: 'band', data: xLabels, tickLabelStyle: { fontSize: 9 } }]}
        yAxis={[{ label: 'sec', labelStyle: { fontSize: 9 } }]}
        series={[{
          data: durations,
          color: colors.iceBlue,
          valueFormatter: (v) => `${v?.toFixed(1) ?? '—'}s`,
        }]}
        colors={barColors}
        height={150}
        margin={{ top: 8, bottom: 30, left: 36, right: 8 }}
      />
    </Box>
  );
}
