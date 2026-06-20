import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { ToolMetrics } from '../../../domain/parser/types';
import { ChartTitle } from './shared/ChartTitle';
import { AnytimeChartView } from './AnytimeChartView';
import { buildPieSpec } from './specs/buildPieSpec';

export function SessionSkillUsageChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { colors, cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const usage = toolMetrics?.skillUsage;
  if (!usage || usage.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
        <ChartTitle title={t('analytics.combined.skill')} description={t('analytics.combined.skill.description')} />
        <Box sx={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h5" sx={{ color: colors.textSecondary }}>0</Typography>
        </Box>
      </Paper>
    );
  }

  const sorted = [...usage].sort((a, b) => b.count - a.count);
  const spec = buildPieSpec(sorted.map((e) => ({ label: `${e.skill} (${e.count})`, value: e.count })));

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
      <ChartTitle title={t('analytics.combined.skill')} description={t('analytics.combined.skill.description')} />
      <AnytimeChartView spec={spec} height={130} />
    </Paper>
  );
}
