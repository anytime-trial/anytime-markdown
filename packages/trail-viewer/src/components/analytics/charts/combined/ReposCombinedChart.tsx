import { useMemo } from 'react';
import { Paper, Typography } from '../../../../ui';
import { useTrailTheme } from '../../../TrailThemeContext';
import type { ChartMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { makeCategoryClick } from './axisInfo';
import { AnytimeChartView } from '../AnytimeChartView';
import { buildStackedBarSpec } from '../specs/buildStackedBarSpec';

export function ReposCombinedChart({
  axisInfo,
  repoMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  repoMetric: ChartMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, toolPalette } = useTrailTheme();
  const { repoRows, repoPeriods, repoLabels, repos, repoMap } = axisInfo;

  const spec = useMemo(() => {
    const getValue = (r: { count: number; tokens: number }): number =>
      repoMetric === 'tokens' ? r.tokens : r.count;
    const valMap = new Map<string, number>();
    for (const r of repoRows) {
      const displayKey = repoMap.get(r.repoName) ?? r.repoName;
      valMap.set(`${r.period}::${displayKey}`, (valMap.get(`${r.period}::${displayKey}`) ?? 0) + getValue(r));
    }
    return buildStackedBarSpec({
      categories: repoLabels,
      series: repos.map((repo, i) => ({
        name: repo,
        values: repoPeriods.map((p) => valMap.get(`${p}::${repo}`) ?? 0),
        color: toolPalette[i % toolPalette.length],
      })),
    });
  }, [repoRows, repoPeriods, repoLabels, repos, repoMap, repoMetric, toolPalette]);

  if (repos.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={240} onCategoryClick={makeCategoryClick(repoPeriods, canDrill, onDateClick)} />
    </Paper>
  );
}
