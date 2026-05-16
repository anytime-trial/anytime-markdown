import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { PieChart } from '@mui/x-charts/PieChart';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { ToolMetrics } from '../../../domain/parser/types';
import { ChartTitle } from './shared/ChartTitle';
import { PieCenterLabel } from './shared/PieCenterLabel';

export function SessionErrorChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { colors, cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const errors = toolMetrics?.errorsByTool;
  if (!errors || errors.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
        <ChartTitle title={t('analytics.combined.error')} description={t('analytics.combined.error.description')} />
        <Box sx={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h5" sx={{ color: colors.textSecondary }}>0</Typography>
        </Box>
      </Paper>
    );
  }

  const sorted = [...errors].sort((a, b) => b.count - a.count);
  const pieData = sorted.map((e, i) => ({
    id: i,
    value: e.count,
    label: `${e.tool} (${e.count})`,
    color: toolPalette[i % toolPalette.length],
  }));

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
      <ChartTitle title={t('analytics.combined.error')} description={t('analytics.combined.error.description')} />
      <PieChart
        series={[{ data: pieData, innerRadius: 28, outerRadius: 52, paddingAngle: 2, cornerRadius: 3 }]}
        height={130}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        slots={{ legend: () => null }}
      >
        <PieCenterLabel value={sorted.reduce((s, e) => s + e.count, 0)} color={colors.textPrimary} />
      </PieChart>
    </Paper>
  );
}
