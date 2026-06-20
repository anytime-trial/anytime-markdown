import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ChartSpec } from '@anytime-markdown/chart-core';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import { AnytimeChartView } from './AnytimeChartView';

export function ReleasesLocChart({ releases }: Readonly<{ releases: readonly TrailRelease[] }>) {
  const { cardSx, colors } = useTrailTheme();
  const { t } = useTrailI18n();

  const dataset = [...releases]
    .filter((r) => r.totalLines > 0 && r.releasedAt)
    .sort((a, b) => a.releasedAt.localeCompare(b.releasedAt))
    .map((r) => ({ tag: r.tag, totalLines: r.totalLines, releaseTimeMin: r.releaseTimeMin ?? null }));

  if (dataset.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">{t('releases.noReleases')}</Typography>
      </Paper>
    );
  }

  // 総 LOC（左軸）とリリース所要時間 min（右軸）のデュアル軸 2 折れ線。
  const spec: ChartSpec = {
    kind: 'line',
    categories: dataset.map((d) => d.tag),
    series: [
      { name: t('releases.totalLoc'), color: colors.iceBlue, values: dataset.map((d) => d.totalLines) },
      { name: t('releases.releaseTimeMin'), color: colors.warning, axis: 'right', values: dataset.map((d) => d.releaseTimeMin) },
    ],
    options: { yAxis: { label: t('releases.totalLoc') }, yAxisRight: { label: t('releases.releaseTimeMin') } },
  };

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={300} />
    </Paper>
  );
}
