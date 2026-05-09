import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarPlot } from '@mui/x-charts/BarChart';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { ChartsDataProvider } from '@mui/x-charts/ChartsDataProvider';
import { ChartsSurface } from '@mui/x-charts/ChartsSurface';
import { ChartsWrapper } from '@mui/x-charts/ChartsWrapper';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { ChartsTooltip } from '@mui/x-charts/ChartsTooltip';
import { ChartsGrid } from '@mui/x-charts/ChartsGrid';
import { ChartsLegend } from '@mui/x-charts/ChartsLegend';
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
    .map((r, i) => ({
      tag: r.tag,
      totalLines: r.totalLines,
      releaseCount: i + 1,
    }));

  if (dataset.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">{t('releases.noReleases')}</Typography>
      </Paper>
    );
  }

  const maxCount = dataset.length;

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <ChartsDataProvider
        dataset={dataset}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series={[
          {
            type: 'line' as const,
            dataKey: 'totalLines',
            label: t('releases.totalLoc'),
            color: colors.iceBlue,
            yAxisId: 'left',
            connectNulls: true,
            showMark: dataset.length <= 30,
            valueFormatter: (v: number | null) => v == null ? null : fmtLoc(v),
          },
          {
            type: 'bar' as const,
            dataKey: 'releaseCount',
            label: t('releases.releaseCount'),
            color: colors.iceBlueBg,
            yAxisId: 'right',
            valueFormatter: (v: number | null) => v == null ? null : `${v}`,
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any}
        xAxis={[{ id: 'tag', scaleType: 'band', dataKey: 'tag' }]}
        yAxis={[
          { id: 'left', valueFormatter: (v: number) => fmtLoc(v) },
          { id: 'right', position: 'right', min: 0, max: maxCount, valueFormatter: (v: number) => Math.round(v).toString() },
        ]}
        height={280}
        margin={{ left: 56, right: 48, top: 8, bottom: 60 }}
      >
        <ChartsWrapper legendDirection="horizontal" legendPosition={{ vertical: 'bottom', horizontal: 'center' }}>
          <ChartsLegend />
          <ChartsSurface>
            <ChartsGrid horizontal />
            <BarPlot />
            <LinePlot />
            <MarkPlot />
            <ChartsXAxis axisId="tag" tickLabelStyle={{ fontSize: 10 }} />
            <ChartsYAxis axisId="left" />
            <ChartsYAxis axisId="right" />
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsWrapper>
      </ChartsDataProvider>
    </Paper>
  );
}
