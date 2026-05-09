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

export function DayCommitPrefixChart({
  sessionIds,
  fetchSessionCommits,
}: Readonly<{
  sessionIds: readonly string[];
  fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
}>) {
  const { colors, cardSx } = useTrailTheme();
  const { getCategoryColor } = useCommitCategory();
  const { t } = useTrailI18n();
  const [commits, setCommits] = useState<readonly TrailSessionCommit[]>([]);
  const [loading, setLoading] = useState(true);

  const sessionIdsKey = sessionIds.join(',');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const results = await Promise.all(sessionIds.map((id) => fetchSessionCommits(id)));
        if (!cancelled) setCommits(results.flat());
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdsKey, fetchSessionCommits]);

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

  const prefixCounts = new Map<string, number>();
  for (const c of commits) {
    const subject = (c.commitMessage ?? '').split('\n')[0];
    const prefix = extractCommitPrefix(subject);
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }
  const sorted = [...prefixCounts.entries()].sort(([, a], [, b]) => b - a);
  const pieData = sorted.map(([prefix, count], i) => ({
    id: i,
    value: count,
    label: `${prefix} (${count})`,
    color: getCategoryColor(prefix),
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
