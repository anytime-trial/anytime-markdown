import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { ChartsDataProvider } from '@mui/x-charts/ChartsDataProvider';
import { ChartsSurface } from '@mui/x-charts/ChartsSurface';
import { ChartsWrapper } from '@mui/x-charts/ChartsWrapper';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { ChartsTooltip } from '@mui/x-charts/ChartsTooltip';
import { ChartsGrid } from '@mui/x-charts/ChartsGrid';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';

function fmtLoc(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toString();
}

export function ReleasesLocChart({ releases }: Readonly<{ releases: readonly TrailRelease[] }>) {
  const { cardSx, colors } = useTrailTheme();
  const { t } = useTrailI18n();

  const dataset = [...releases]
    .filter((r) => r.totalLines > 0 && r.releasedAt)
    .sort((a, b) => a.releasedAt.localeCompare(b.releasedAt))
    .map((r) => ({ tag: r.tag, totalLines: r.totalLines }));

  if (dataset.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">{t('releases.noReleases')}</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <ChartsDataProvider
        dataset={dataset}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series={[{
          type: 'line' as const,
          dataKey: 'totalLines',
          label: t('releases.totalLoc'),
          color: colors.iceBlue,
          connectNulls: true,
          showMark: dataset.length <= 30,
          valueFormatter: (v: number | null) => v == null ? null : fmtLoc(v),
        }] as any}
        xAxis={[{ id: 'tag', scaleType: 'band', dataKey: 'tag' }]}
        yAxis={[{ valueFormatter: (v: number) => fmtLoc(v) }]}
        height={280}
        margin={{ left: 56, right: 16, top: 8, bottom: 60 }}
      >
        <ChartsWrapper>
          <ChartsSurface>
            <ChartsGrid horizontal />
            <LinePlot />
            <MarkPlot />
            <ChartsXAxis axisId="tag" tickLabelStyle={{ fontSize: 10 }} />
            <ChartsYAxis />
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsWrapper>
      </ChartsDataProvider>
    </Paper>
  );
}
