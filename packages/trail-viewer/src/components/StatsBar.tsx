import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';

import type { TrailMessage, TrailSession } from '../parser/types';

interface StatsBarProps {
  readonly session?: TrailSession;
  readonly messages: readonly TrailMessage[];
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
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
  if (!session) {
    return (
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No session selected
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
        borderColor: 'divider',
        display: 'flex',
        gap: 1,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <Chip
        label={`Input: ${formatNumber(usage.inputTokens)}`}
        size="small"
        variant="outlined"
      />
      <Chip
        label={`Output: ${formatNumber(usage.outputTokens)}`}
        size="small"
        variant="outlined"
      />
      <Chip
        label={`Cache read: ${formatNumber(usage.cacheReadTokens)}`}
        size="small"
        variant="outlined"
      />
      <Chip
        label={`Duration: ${formatDuration(session.startTime, session.endTime)}`}
        size="small"
        variant="outlined"
      />
      <Chip
        label={`${messages.length} messages`}
        size="small"
        variant="outlined"
      />
    </Box>
  );
}
