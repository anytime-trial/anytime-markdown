import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { MetricValue, DoraLevel } from '@anytime-markdown/trail-core/domain/metrics';
import { useTrailI18n } from '../../i18n';
import { MetricSparkline } from './MetricSparkline';

function formatValue(m: MetricValue): string {
  if (m.unit === 'perDay') {
    return m.value >= 1
      ? `${m.value.toFixed(1)}/day`
      : m.value > 0
        ? `${(m.value * 7).toFixed(1)}/week`
        : '0/day';
  }
  if (m.unit === 'hours') {
    return m.value < 24
      ? `${m.value.toFixed(1)}h`
      : `${(m.value / 24).toFixed(1)}d`;
  }
  if (m.unit === 'minPerLoc') {
    return m.value < 60
      ? `${m.value.toFixed(2)} min/LOC`
      : `${(m.value / 60).toFixed(1)} h/LOC`;
  }
  if (m.unit === 'tokensPerLoc') {
    return m.value >= 1000
      ? `${(m.value / 1000).toFixed(1)}k tok/LOC`
      : `${m.value.toFixed(0)} tok/LOC`;
  }
  return `${m.value.toFixed(1)}%`;
}

function levelColor(level: DoraLevel, isDark: boolean) {
  // Elite=info(blue-ish), High=success(green), Medium=warning(orange), Low=error(red)
  switch (level) {
    case 'elite': return isDark ? '#42A5F5' : '#1976D2';
    case 'high': return isDark ? '#66BB6A' : '#2E7D32';
    case 'medium': return isDark ? '#FFA726' : '#ED6C02';
    case 'low': return isDark ? '#F44336' : '#D32F2F';
  }
}

function DeltaBadge({ deltaPct }: Readonly<{ deltaPct: number | null }>) {
  const { t } = useTrailI18n();
  if (deltaPct === null) return <Typography variant="caption" color="text.disabled">{t('metrics.noLevel')}</Typography>;
  const arrow = deltaPct > 0 ? '↑' : deltaPct < 0 ? '↓' : '→';
  const color = deltaPct > 0 ? 'success.main' : deltaPct < 0 ? 'error.main' : 'text.secondary';
  return (
    <Typography variant="caption" sx={{ color }}>
      {arrow} {Math.abs(deltaPct).toFixed(1)}%
    </Typography>
  );
}

export interface MetricCardProps {
  readonly metric: MetricValue;
  readonly bucket: 'day' | 'week';
}

const NAME_KEYS: Record<string, string> = {
  deploymentFrequency: 'metrics.deploymentFrequency.name',
  leadTimePerLoc: 'metrics.leadTimePerLoc.name',
  tokensPerLoc: 'metrics.tokensPerLoc.name',
  aiFirstTrySuccessRate: 'metrics.aiFirstTrySuccessRate.name',
  changeFailureRate: 'metrics.changeFailureRate.name',
};

const LEVEL_KEYS: Record<DoraLevel, string> = {
  elite: 'metrics.level.elite',
  high: 'metrics.level.high',
  medium: 'metrics.level.medium',
  low: 'metrics.level.low',
};

export function MetricCard({ metric, bucket }: Readonly<MetricCardProps>) {
  const { t } = useTrailI18n();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const isEmpty = metric.sampleSize === 0;
  const labelKey = NAME_KEYS[metric.id] ?? metric.id;

  const chipColor = useMemo(
    () => metric.level ? levelColor(metric.level, isDark) : undefined,
    [metric.level, isDark],
  );

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        height: '100%',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {t(labelKey as Parameters<typeof t>[0])}
      </Typography>

      {isEmpty ? (
        <Typography variant="body2" color="text.disabled">{t('metrics.empty')}</Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatValue(metric)}
            </Typography>
            {metric.level && (
              <Chip
                label={t(LEVEL_KEYS[metric.level] as Parameters<typeof t>[0])}
                size="small"
                sx={{ backgroundColor: chipColor, color: '#fff', fontWeight: 700, height: 20, fontSize: 10 }}
              />
            )}
          </Box>

          {metric.comparison && (
            <DeltaBadge deltaPct={metric.comparison.deltaPct} />
          )}

          {metric.timeSeries.length >= 2 && (
            <Box sx={{ mt: 1 }}>
              <MetricSparkline timeSeries={metric.timeSeries} bucket={bucket} />
            </Box>
          )}
        </>
      )}
    </Paper>
  );
}
