'use client';

import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { Box, Chip, Link, Stack, Tooltip, Typography } from '@mui/material';
import { memo } from 'react';

import type { InsightEntry } from '../../../../lib/insightTimeline/types';
import {
  ACCENT_AMBER,
  formatCompactDate,
  formatFullDate,
  IMPACT_META,
  INSIGHT_CATEGORY_META,
} from '../constants';

interface Props {
  readonly entry: InsightEntry;
  /** このカードが並んでいるテーマ。見出しと同じテーマのチップは出さない（重複するため） */
  readonly currentThemeId: string;
  readonly themeLabels: ReadonlyMap<string, string>;
}

/**
 * 経緯の 1 件。
 *
 * リリースカードと違い折りたたみを持たない。要約は 1〜2 文に制限してあり、経緯は
 * 「順に読んで変化を追う」読み方をされる——1 件ずつ開かせると流れが切れる。
 */
function InsightCard({ entry, currentThemeId, themeLabels }: Props) {
  const impact = entry.impact ? IMPACT_META[entry.impact] : null;
  const isHigh = entry.impact === 'high';
  const otherThemes = entry.themes.filter((id) => id !== currentThemeId);

  return (
    <Box
      component="li"
      data-testid="insight-card"
      data-category={entry.category}
      data-impact={entry.impact ?? 'none'}
      sx={{
        display: 'flex',
        gap: 2,
        py: 1.5,
        borderTop: '1px solid',
        borderColor: 'divider',
        '&:first-of-type': { borderTop: 'none' },
      }}
    >
      <Box sx={{ flex: '0 0 5.5rem', pt: 0.25 }}>
        <Typography
          component="time"
          dateTime={entry.date}
          variant="body2"
          sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
        >
          {formatCompactDate(entry.date)}
        </Typography>
        {entry.dateConfidence === 'report-date' && (
          <Tooltip
            title={`本文に日付の明記が無く、レポート発行日（${formatFullDate(entry.date)}）で代用しています`}
          >
            {/*
             * titleAccess を使うのは、MUI の SvgIcon が指定の無いとき aria-hidden="true" を
             * 出すため。aria-label を渡しても aria-hidden が勝ち、「日付は推定」という情報が
             * 支援技術には確定値として伝わる（ReleaseCard と同じ理由）
             */}
            <Box component="span" tabIndex={0} sx={{ display: 'inline-flex', ml: 0.5 }}>
              <HelpOutlineIcon
                titleAccess="日付は推定"
                sx={{ fontSize: '0.9rem', color: 'text.disabled' }}
              />
            </Box>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body1" sx={{ fontWeight: isHigh ? 600 : 400, lineHeight: 1.6 }}>
          {entry.title}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary', lineHeight: 1.8 }}>
          {entry.summary}
        </Typography>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 1 }}
        >
          <Chip
            size="small"
            variant="outlined"
            label={INSIGHT_CATEGORY_META[entry.category].label}
            sx={
              // Why not: 高影響でもアンバーを文字色にしない。ライトモードの和紙地
              // （#F2EFE8）に #E8A012 を載せるとコントラスト比が約 2:1 で WCAG AA を
              // 満たさない。差し色は枠線に置き、文字は本文色のままにする
              isHigh ? { borderColor: ACCENT_AMBER, color: 'text.primary' } : undefined
            }
          />
          {impact && (
            <Chip
              size="small"
              variant={isHigh ? 'filled' : 'outlined'}
              label={`${impact.mark} ${impact.label}`}
              sx={
                isHigh
                  ? { bgcolor: ACCENT_AMBER, color: '#1F1E1C', fontWeight: 700 }
                  : { color: 'text.secondary' }
              }
            />
          )}
          {otherThemes.map((id) => (
            <Chip
              key={id}
              size="small"
              variant="outlined"
              label={themeLabels.get(id) ?? id}
              sx={{ color: 'text.secondary' }}
            />
          ))}
        </Stack>

        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
          {entry.sources.map((source) => (
            <Typography key={source.report} variant="caption" sx={{ color: 'text.disabled' }}>
              出典: {source.report}
              {source.url && (
                <>
                  {' / '}
                  <Link href={source.url} target="_blank" rel="noopener noreferrer">
                    一次ソース
                  </Link>
                </>
              )}
            </Typography>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

/**
 * 絞り込みのたびに開いているトラックの全カードが再レンダリングされるのを止める。
 * `entry` はビルド時に確定した不変オブジェクトで参照が安定しているため浅い比較で効く。
 */
export default memo(InsightCard);
