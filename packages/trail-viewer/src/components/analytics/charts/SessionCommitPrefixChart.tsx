import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { PieChart } from '@mui/x-charts/PieChart';
import { extractCommitPrefix } from '@anytime-markdown/trail-core/domain';
import { useTrailTheme } from '../../TrailThemeContext';
import { useCommitCategory } from '../../CommitCategoryContext';
import { useTrailI18n } from '../../../i18n';
import type { TrailSessionCommit } from '../../../domain/parser/types';
import { ChartTitle } from './shared/ChartTitle';
import { PieCenterLabel } from './shared/PieCenterLabel';

export function SessionCommitPrefixChart({
  sessionId,
  fetchSessionCommits,
}: Readonly<{
  sessionId: string;
  fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
}>) {
  const { colors, cardSx } = useTrailTheme();
  const { getCategory } = useCommitCategory();
  const { t } = useTrailI18n();
  const [commits, setCommits] = useState<readonly TrailSessionCommit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetchSessionCommits(sessionId);
        if (!cancelled) setCommits(result);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, fetchSessionCommits]);

  if (loading) return null;

  if (commits.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
        <ChartTitle title={t('analytics.commitPrefixChartTitle')} description={t('analytics.commitPrefixChartTitle.description')} />
        <Box sx={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h5" sx={{ color: colors.textSecondary }}>0</Typography>
        </Box>
      </Paper>
    );
  }

  const { commitCategoryColors } = useTrailTheme();
  const categoryCounts = new Map<number, number>();
  for (const c of commits) {
    const subject = (c.commitMessage ?? '').split('\n')[0];
    const prefix = extractCommitPrefix(subject);
    const cat = getCategory(prefix);
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }
  const CATEGORY_LABELS = ['計画的開発', '事後対応', 'その他'];
  const pieData = [...categoryCounts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([cat, count]) => ({
      id: cat,
      value: count,
      label: `${CATEGORY_LABELS[cat] ?? 'その他'} (${count})`,
      color: commitCategoryColors[cat] ?? commitCategoryColors[2],
    }));

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
      <ChartTitle title={t('analytics.commitPrefixChartTitle')} description={t('analytics.commitPrefixChartTitle.description')} />
      <PieChart
        series={[{ data: pieData, innerRadius: 28, outerRadius: 52, paddingAngle: 2, cornerRadius: 3 }]}
        height={130}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        slots={{ legend: () => null }}
      >
        <PieCenterLabel value={commits.length} color={colors.textPrimary} />
      </PieChart>
    </Paper>
  );
}
