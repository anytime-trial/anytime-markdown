import { ArrowDownward as ArrowDownwardIcon, ArrowUpward as ArrowUpwardIcon, Box, Cached as CachedIcon, Chip, Typography } from '../ui';

import type { TrailMessage, TrailSession } from '../domain/parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';

interface StatsBarProps {
  readonly session?: TrailSession;
  readonly messages: readonly TrailMessage[];
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDuration(startTime: string, endTime: string): string {
  if (!startTime || !endTime) return '-';
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return '-';
  const ms = end - start;
  if (ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function StatsBar({ session, messages }: Readonly<StatsBarProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();
  if (!session) {
    return (
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: 1,
          borderColor: colors.border,
          bgcolor: colors.charcoal,
        }}
      >
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
          {t('stats.noSessionSelected')}
        </Typography>
      </Box>
    );
  }

  const usage = session.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        borderTop: 1,
        borderColor: colors.border,
        bgcolor: colors.charcoal,
        display: 'flex',
        gap: 1,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <Chip
        icon={<ArrowDownwardIcon fontSize="small" />}
        label={`${t('stats.input')} ${formatNumber(usage.inputTokens)}`}
        size="small"
        variant="outlined"
        sx={{ borderColor: colors.iceBlue, color: colors.iceBlue }}
      />
      <Chip
        icon={<ArrowUpwardIcon fontSize="small" />}
        label={`${t('stats.output')} ${formatNumber(usage.outputTokens)}`}
        size="small"
        variant="outlined"
        sx={{ borderColor: colors.error, color: colors.error }}
      />
      <Chip
        icon={<CachedIcon fontSize="small" />}
        label={`${t('stats.cacheRead')} ${formatNumber(usage.cacheReadTokens)}`}
        size="small"
        variant="outlined"
        sx={{ borderColor: colors.success, color: colors.success }}
      />
      <Chip
        label={`${t('stats.duration')} ${formatDuration(session.startTime, session.endTime)}`}
        size="small"
        variant="outlined"
        sx={{ borderColor: colors.textSecondary, color: colors.textSecondary }}
      />
      <Chip
        label={`${messages.length} ${t('stats.messages')}`}
        size="small"
        variant="outlined"
        sx={{ borderColor: colors.textSecondary, color: colors.textSecondary }}
      />
    </Box>
  );
}
