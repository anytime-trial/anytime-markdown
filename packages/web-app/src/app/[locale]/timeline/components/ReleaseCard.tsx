'use client';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { Box, Chip, Collapse, IconButton, Link, Stack, Tooltip, Typography } from '@mui/material';
import { memo, useState } from 'react';

import type { ReleaseEntry } from '../../../../lib/releaseTimeline/types';
import { ACCENT_AMBER, formatDayLabel, formatFullDate, IMPACT_META, KIND_META } from '../constants';

interface Props {
  readonly entry: ReleaseEntry;
}

function versionLabel(entry: ReleaseEntry): string {
  const base = entry.kind === 'cli' ? `v${entry.version}` : entry.version;
  return entry.versionTo ? `${base}–v${entry.versionTo}` : base;
}

/**
 * 年表の 1 リリース。
 *
 * 影響度「高」は既定で変更点を開いた状態にする（ユーザーが年表に求めるのは
 * 「どこが節目か」で、節目だけ全部クリックさせるのは年表の役目を客へ返している）。
 */
function ReleaseCard({ entry }: Props) {
  const impact = entry.impact ? IMPACT_META[entry.impact] : null;
  const isHigh = entry.impact === 'high';
  const [open, setOpen] = useState(isHigh);
  const hasDetails = entry.highlights.length > 0;
  const contentId = `${entry.id}-details`;

  return (
    <Box
      component="li"
      data-testid="release-card"
      data-kind={entry.kind}
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
      <Box sx={{ flex: '0 0 4.5rem', pt: 0.25 }}>
        <Typography
          component="time"
          dateTime={entry.date}
          variant="body2"
          sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
        >
          {formatDayLabel(entry.date)}
        </Typography>
        {entry.dateConfidence === 'report-date' && (
          <Tooltip
            title={`リリース日の明記が無く、レポート発行日（${formatFullDate(entry.date)}）で代用しています`}
          >
            {/*
             * titleAccess を使うのは、MUI の SvgIcon が指定の無いとき aria-hidden="true" を
             * 出すため。aria-label を渡しても aria-hidden が勝ち、「日付は推定」という情報が
             * 支援技術には確定値として伝わる。span に tabIndex を置くのは、Tooltip の子が
             * 非フォーカス要素だとキーボードだけでは代用の理由に到達できないから
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
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={versionLabel(entry)}
            sx={{
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              // Why not: 高影響でも版数をアンバー「文字色」にしない。ライトモードの和紙地
              // （#F2EFE8）に #E8A012 を載せるとコントラスト比が約 2:1 しか出ず、
              // WCAG AA（4.5:1）を満たさない。差し色は枠線に置き、文字は本文色のままにする
              ...(isHigh
                ? {
                    bgcolor: 'transparent',
                    border: `1px solid ${ACCENT_AMBER}`,
                    color: 'text.primary',
                  }
                : {}),
            }}
          />
          <Chip size="small" variant="outlined" label={KIND_META[entry.kind].short} />
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
        </Stack>

        <Typography
          variant="body1"
          sx={{ mt: 0.75, fontWeight: isHigh ? 600 : 400, lineHeight: 1.6 }}
        >
          {entry.headline}
        </Typography>

        {hasDetails && (
          <>
            {/*
             * aria-label で名前を差し替えない。可視テキスト「変更点 N 件」が
             * accessible name に含まれないと、音声入力で見えている文言を読み上げても
             * 一致しない（WCAG 2.5.3 Label in Name）。開閉状態は aria-expanded が担う。
             * aria-controls は開いている間だけ出す。Collapse が unmountOnExit なので、
             * 閉じているカードでは参照先の要素が DOM に存在しない
             */}
            <IconButton
              size="small"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={open ? contentId : undefined}
              sx={{ mt: 0.25, ml: -0.5, borderRadius: 1 }}
            >
              {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              <Typography variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
                変更点 {entry.highlights.length} 件
              </Typography>
            </IconButton>
            <Collapse in={open} unmountOnExit>
              <Box component="ul" id={contentId} sx={{ pl: 2.5, my: 1 }}>
                {entry.highlights.map((highlight) => (
                  <Typography
                    component="li"
                    key={highlight}
                    variant="body2"
                    sx={{ color: 'text.secondary', lineHeight: 1.7 }}
                  >
                    {highlight}
                  </Typography>
                ))}
              </Box>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
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
            </Collapse>
          </>
        )}
      </Box>
    </Box>
  );
}

/**
 * 絞り込みのたびに表示中の全カード（最大 98 枚）が再レンダリングされるのを止める。
 * `entry` はビルド時に確定した不変オブジェクトで参照が安定しているため浅い比較で効く。
 */
export default memo(ReleaseCard);
