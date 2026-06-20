import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReleaseQualityBucket } from '@anytime-markdown/trail-core/domain/metrics';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import { releaseColors } from '../../../theme/designTokens';
import { AnytimeChartView } from './AnytimeChartView';
import { buildStackedBarSpec } from './specs/buildStackedBarSpec';

export function ReleasesBarChart({ timeSeries }: Readonly<{
  timeSeries: ReadonlyArray<ReleaseQualityBucket>;
}>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();

  if (timeSeries.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">{t('metrics.empty')}</Typography>
      </Paper>
    );
  }

  const fmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' });
  const labels = timeSeries.map((d) => fmt.format(new Date(d.bucketStart)));
  const spec = buildStackedBarSpec({
    categories: labels,
    series: [
      { name: t('analytics.combined.releaseSucceeded'), values: timeSeries.map((d) => d.succeeded), color: releaseColors.succeeded },
      { name: t('analytics.combined.releaseFailed'), values: timeSeries.map((d) => d.failed), color: releaseColors.failed },
    ],
  });

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={240} />
    </Paper>
  );
}
