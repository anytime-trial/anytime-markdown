'use client';

import { Box, Stack, Tooltip, Typography, useTheme } from '@mui/material';

import type { MonthlyReleaseCount } from '../../../../lib/releaseTimeline/types';
import { ACCENT_AMBER, formatMonth } from '../constants';

interface Props {
  readonly months: readonly MonthlyReleaseCount[];
}

const CHART_HEIGHT = 88;

/**
 * 月別のリリース件数。年表そのものからは読み取りづらい「リリース頻度の推移」を出す。
 *
 * 高さは最大月に対する比率で決める。固定スケールにすると、月ごとの件数が 1 桁変わった
 * ときに棒が振り切れて差が読めなくなる。
 */
export default function ReleaseCadence({ months }: Props) {
  const theme = useTheme();
  const peak = months.reduce((max, m) => Math.max(max, m.cli + m.model), 0);
  if (peak === 0) return null;

  const modelColor = theme.palette.mode === 'dark' ? theme.palette.primary.main : theme.palette.primary.dark;

  return (
    <Box component="section" aria-labelledby="cadence-heading" sx={{ mt: 4 }}>
      <Typography id="cadence-heading" variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
        月別リリース件数（レポートが観測した件数）
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        alignItems="flex-end"
        sx={{ height: CHART_HEIGHT, overflowX: 'auto', pb: 0.5 }}
      >
        {months.map((month) => {
          const total = month.cli + month.model;
          const label = `${formatMonth(month.month)}: Claude Code ${month.cli} 件・モデル ${month.model} 件`;
          return (
            <Tooltip key={month.month} title={label}>
              <Stack
                data-testid="cadence-bar"
                aria-label={label}
                sx={{ flex: '1 0 2.5rem', minWidth: '2.5rem', height: '100%', justifyContent: 'flex-end' }}
              >
                <Typography
                  variant="caption"
                  sx={{ textAlign: 'center', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                >
                  {total}
                </Typography>
                <Box
                  sx={{
                    height: `${(month.model / peak) * 100}%`,
                    bgcolor: modelColor,
                    borderRadius: '2px 2px 0 0',
                  }}
                />
                <Box sx={{ height: `${(month.cli / peak) * 100}%`, bgcolor: ACCENT_AMBER }} />
                <Typography
                  variant="caption"
                  sx={{ textAlign: 'center', color: 'text.disabled', mt: 0.5, whiteSpace: 'nowrap' }}
                >
                  {month.month.slice(5)}月
                </Typography>
              </Stack>
            </Tooltip>
          );
        })}
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
        <Legend color={ACCENT_AMBER} label="Claude Code" />
        <Legend color={modelColor} label="Claude モデル" />
      </Stack>
    </Box>
  );
}

function Legend({ color, label }: Readonly<{ color: string; label: string }>) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box sx={{ width: 12, height: 12, bgcolor: color, borderRadius: '2px' }} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
    </Stack>
  );
}
