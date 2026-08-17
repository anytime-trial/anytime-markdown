'use client';

import { Box, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import { visuallyHidden } from '@mui/utils';

import type { MonthlyReleaseCount } from '../../../../lib/releaseTimeline/types';
import { ACCENT_AMBER, fillMonthGaps, formatMonth } from '../constants';

interface Props {
  readonly months: readonly MonthlyReleaseCount[];
}

const CHART_HEIGHT = 88;

function barLabel(month: MonthlyReleaseCount): string {
  return `${formatMonth(month.month)}: Claude Code ${month.cli} 件・Claude モデル ${month.model} 件`;
}

/**
 * 月別のリリース件数。年表そのものからは読み取りづらい「リリース頻度の推移」を出す。
 *
 * 高さは最大月に対する比率で決める。固定スケールにすると、月ごとの件数が 1 桁変わった
 * ときに棒が振り切れて差が読めなくなる。
 */
export default function ReleaseCadence({ months }: Props) {
  const theme = useTheme();
  // 欠測月を詰めると空白期間が空白として見えず、「頻度の推移」を誤読させる
  const filled = fillMonthGaps(months);
  const peak = filled.reduce((max, m) => Math.max(max, m.cli + m.model), 0);
  if (peak === 0) return null;

  const modelColor =
    theme.palette.mode === 'dark' ? theme.palette.primary.main : theme.palette.primary.dark;

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
        {filled.map((month, index) => {
          const total = month.cli + month.model;
          // 積み上げの内訳は色でしか表現できないため、バー自体を role="img" にして
          // accessible name で内訳を言う（role の無い div では aria-label が公開されない）
          return (
            <Tooltip key={month.month} title={barLabel(month)}>
              <Stack
                data-testid="cadence-bar"
                role="img"
                tabIndex={0}
                aria-label={barLabel(month)}
                sx={{
                  flex: '1 0 2.5rem',
                  minWidth: '2.5rem',
                  height: '100%',
                  justifyContent: 'flex-end',
                }}
              >
                <Typography
                  aria-hidden
                  variant="caption"
                  sx={{
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontVariantNumeric: 'tabular-nums',
                  }}
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
                <Box
                  sx={{
                    height: `${(month.cli / peak) * 100}%`,
                    bgcolor: ACCENT_AMBER,
                  }}
                />
                <Typography
                  aria-hidden
                  variant="caption"
                  sx={{
                    textAlign: 'center',
                    color: 'text.disabled',
                    mt: 0.5,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {monthAxisLabel(filled, index)}
                </Typography>
              </Stack>
            </Tooltip>
          );
        })}
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
        <Legend color={ACCENT_AMBER} label="Claude Code" shape="■" />
        <Legend color={modelColor} label="Claude モデル" shape="▲" />
      </Stack>
      {/* 色と系列の対応を色以外でも取れるようにする。6〜12 行程度なので DOM コストは無視できる */}
      <Box component="table" sx={visuallyHidden}>
        <caption>月別リリース件数の内訳</caption>
        <tbody>
          {filled.map((month) => (
            <tr key={month.month}>
              <th scope="row">{formatMonth(month.month)}</th>
              <td>Claude Code {month.cli} 件</td>
              <td>Claude モデル {month.model} 件</td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

/** 年が変わる位置だけ年を出す。`04月` が複数年ぶんの軸に並ぶと区別できなくなる */
function monthAxisLabel(months: readonly MonthlyReleaseCount[], index: number): string {
  const [year, month] = months[index].month.split('-');
  const isNewYear = index === 0 || months[index - 1].month.slice(0, 4) !== year;
  return isNewYear ? `${year}年${Number(month)}月` : `${Number(month)}月`;
}

function Legend({
  color,
  label,
  shape,
}: Readonly<{ color: string; label: string; shape: string }>) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      {/* 色見本に記号を添える。色覚特性によっては 2 系列の色が同じに見える */}
      <Box aria-hidden sx={{ color, lineHeight: 1 }}>
        {shape}
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {shape} {label}
      </Typography>
    </Stack>
  );
}
