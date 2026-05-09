import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { PieChart } from '@mui/x-charts/PieChart';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { ToolMetrics } from '../../../domain/parser/types';
import { ChartTitle } from './shared/ChartTitle';
import { PieCenterLabel } from './shared/PieCenterLabel';
import { useSkillCategory } from '../../SkillCategoryContext';

export function SessionSkillUsageChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { colors, cardSx } = useTrailTheme();
  const { getSkillCategoryColor } = useSkillCategory();
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
  const pieData = sorted.map((e, i) => ({
    id: i,
    value: e.count,
    label: `${e.skill} (${e.count})`,
    color: getSkillCategoryColor(e.skill),
  }));

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
      <ChartTitle title={t('analytics.combined.skill')} description={t('analytics.combined.skill.description')} />
      <PieChart
        series={[{ data: pieData, innerRadius: 28, outerRadius: 52, paddingAngle: 2, cornerRadius: 3 }]}
        height={130}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        slots={{ legend: () => null }}
      >
        <PieCenterLabel value={sorted.reduce((s, e) => s + e.count, 0)} color={colors.textPrimary} />
      </PieChart>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1.5, pb: 0.5 }}>
        {sorted.map((e) => (
          <Chip
            key={e.skill}
            size="small"
            label={`${e.skill} (${e.count})`}
            sx={{ bgcolor: getSkillCategoryColor(e.skill), color: '#fff', fontSize: '0.65rem', height: 18 }}
          />
        ))}
      </Box>
    </Paper>
  );
}
