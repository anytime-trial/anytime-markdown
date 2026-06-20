import { useMemo } from 'react';
import { Box, Typography } from '../../ui';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import { buildStackedChartData } from './pipelineChartData';
import { AnytimeChartView } from '../analytics/charts/AnytimeChartView';
import { buildStackedBarSpec } from '../analytics/charts/specs/buildStackedBarSpec';
import type { MemoryPipelineRunStatsByDayRow } from '../../data/types';

export interface PipelineRunsTimelineProps {
  readonly rows: readonly MemoryPipelineRunStatsByDayRow[];
}

// scope ごとに HSL の hue をずらして安定色を返す。テーマには依存しないが
// MUI チャート上で十分な区別がつくよう彩度・明度は固定。
function scopeColor(scope: string): string {
  let hash = 0;
  for (let i = 0; i < scope.length; i++) hash = (hash * 31 + scope.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

export function PipelineRunsTimeline({ rows }: Readonly<PipelineRunsTimelineProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();

  const { xLabels, series } = useMemo(() => buildStackedChartData(rows), [rows]);

  const spec = useMemo(
    () =>
      buildStackedBarSpec({
        categories: [...xLabels],
        series: series.map((s) => ({ name: s.scope, values: [...s.data], color: scopeColor(s.scope) })),
        yAxisLabel: 'sec',
      }),
    [xLabels, series],
  );

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('memory.runs.empty')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: 160, px: 1 }} aria-label={t('memory.runs.timeline')}>
      <AnytimeChartView spec={spec} height={150} />
    </Box>
  );
}
