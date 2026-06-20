import { Box, Paper, Typography } from '../../../ui';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { ToolMetrics } from '../../../domain/parser/types';
import { ChartTitle } from './shared/ChartTitle';
import { AnytimeChartView } from './AnytimeChartView';
import { buildPieSpec } from './specs/buildPieSpec';

export function SessionErrorChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { colors, cardSx } = useTrailTheme();
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
  const spec = buildPieSpec(sorted.map((e) => ({ label: `${e.tool} (${e.count})`, value: e.count })), undefined);

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
      <ChartTitle title={t('analytics.combined.error')} description={t('analytics.combined.error.description')} />
      <AnytimeChartView spec={spec} height={130} palette="red" />
    </Paper>
  );
}
