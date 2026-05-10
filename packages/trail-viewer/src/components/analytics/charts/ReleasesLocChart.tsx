import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { BarPlot } from '@mui/x-charts/BarChart';
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

function fmtLoc(v: number | null): string {
  if (v == null) return '';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toString();
}

function fmtMin(v: number | null): string {
  if (v == null) return '';
  if (v >= 60) return `${Math.round(v / 60)}h`;
  return `${Math.round(v)}m`;
}

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
            connectNulls: true,
            showMark: dataset.length <= 30,
            yAxisId: 'loc',
            valueFormatter: (v: number | null) => fmtLoc(v),
          },
          {
            type: 'line' as const,
            dataKey: 'releaseTimeMin',
            label: t('releases.releaseTimeMin'),
            color: colors.warning,
            connectNulls: true,
            showMark: dataset.length <= 30,
            yAxisId: 'time',
            valueFormatter: fmtMin,
          },
        ] as any}
        xAxis={[{ id: 'tag', scaleType: 'band', dataKey: 'tag' }]}
        yAxis={[
          { id: 'loc', valueFormatter: fmtLoc, width: 56 },
          { id: 'time', position: 'right', valueFormatter: fmtMin, width: 48 },
        ]}
        height={300}
        margin={{ left: 0, right: 0, top: 8, bottom: 60 }}
      >
        <ChartsWrapper>
          <ChartsSurface>
            <ChartsGrid horizontal />
            <BarPlot />
            <LinePlot />
            <MarkPlot />
            <ChartsXAxis axisId="tag" tickLabelStyle={{ fontSize: 10 }} />
            <ChartsYAxis axisId="loc" />
            <ChartsYAxis axisId="time" />
          </ChartsSurface>
          <ChartsTooltip />
          <ChartsLegend direction="horizontal" />
        </ChartsWrapper>
      </ChartsDataProvider>
    </Paper>
  );
}
