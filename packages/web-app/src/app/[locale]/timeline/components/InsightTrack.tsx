'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  ButtonGroup,
  Stack,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';

import { buildThemeTracks, countByCategory } from '../../../../lib/insightTimeline/normalize';
import type {
  InsightEntry,
  InsightTheme,
  InsightThemeTrack,
} from '../../../../lib/insightTimeline/types';
import {
  formatFullDate,
  formatSpan,
  INSIGHT_CATEGORY_FILTERS,
  INSIGHT_CATEGORY_META,
  INSIGHT_DEFAULT_OPEN_TRACKS,
  INSIGHT_TRACK_PREVIEW_COUNT,
  type InsightCategoryFilter,
} from '../constants';
import InsightCard from './InsightCard';

interface Props {
  readonly entries: readonly InsightEntry[];
  readonly themes: readonly InsightTheme[];
  readonly sourceReportCount: number;
  /** 収録期間（データが空なら null）。年表本体と同じ形で内訳の末尾に出す */
  readonly period: { readonly from: string; readonly to: string } | null;
}

/**
 * 知見の経緯トラック。
 *
 * リリース年表と同じページに並ぶが、月見出しを共有しない。別の軸（テーマ）で束ねた
 * 別の観測なので、絞り込みも並びも独立して動く。テーマ内だけは日付昇順にする——
 * 経緯は古い順に読まないと変遷にならない（年表本体は新しい順で、向きが逆になる）。
 */
export default function InsightTrack({ entries, themes, sourceReportCount, period }: Props) {
  const [category, setCategory] = useState<InsightCategoryFilter>('all');
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [fullyShown, setFullyShown] = useState<ReadonlySet<string>>(new Set());

  const filtered = useMemo(
    () => (category === 'all' ? entries : entries.filter((e) => e.category === category)),
    [entries, category],
  );

  const tracks = useMemo(() => buildThemeTracks(filtered, themes), [filtered, themes]);

  // memo した InsightCard の浅い比較を壊さないよう、Map の同一性を保つ
  const themeLabels = useMemo(
    () => new Map(themes.map((theme) => [theme.id, theme.label])),
    [themes],
  );

  // 内訳は絞り込みに追従させない。何を絞り込めるかを先に示す一覧なので、
  // 絞った結果で数字が動くと「エコシステムは 0 件」のように読めてしまう
  const categoryCounts = useMemo(() => countByCategory(entries), [entries]);

  /**
   * 既定は件数上位 3 テーマを開く。
   *
   * Why not: 開閉状態を「開いている id の集合」1 つで持たない。既定開の 3 件は
   * 絞り込みでテーマの順位が入れ替わるたびに変わるため、初期値を state に焼くと
   * 絞り込み後に「ユーザーが開いた覚えのないテーマ」が開く。既定からの差分
   * （閉じた／開いた）だけを持ち、既定そのものは毎回 tracks から引き直す。
   */
  const isOpen = (themeId: string, index: number): boolean => {
    if (opened.has(themeId)) return true;
    if (closed.has(themeId)) return false;
    return index < INSIGHT_DEFAULT_OPEN_TRACKS;
  };

  const toggle = (themeId: string, index: number): void => {
    const nextOpen = !isOpen(themeId, index);
    setOpened((prev) => {
      const next = new Set(prev);
      if (nextOpen) next.add(themeId);
      else next.delete(themeId);
      return next;
    });
    setClosed((prev) => {
      const next = new Set(prev);
      if (nextOpen) next.delete(themeId);
      else next.add(themeId);
      return next;
    });
  };

  const visibleEntries = (track: InsightThemeTrack): readonly InsightEntry[] =>
    fullyShown.has(track.themeId)
      ? track.entries
      : track.entries.slice(0, INSIGHT_TRACK_PREVIEW_COUNT);

  const hiddenCount = (track: InsightThemeTrack): number =>
    track.entries.length - visibleEntries(track).length;

  const showAll = (themeId: string): void => {
    setFullyShown((prev) => new Set(prev).add(themeId));
  };

  return (
    <Box component="section" sx={{ mt: 8 }} aria-labelledby="insight-track-heading">
      <Typography id="insight-track-heading" variant="h5" component="h2" gutterBottom>
        知見の経緯
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '60ch', lineHeight: 1.8 }}>
        {`同じ ${sourceReportCount} 本のレポートから、リリースに紐づかない知見——運用手法・技術動向・新語彙・エコシステムの変化——をテーマごとに束ねたものです。テーマの中は古い順に並んでおり、上から読むとその主題が何からどう変わってきたかを追えます。`}
      </Typography>

      <Stack
        direction="row"
        spacing={{ xs: 2, sm: 4 }}
        sx={{ mt: 3, flexWrap: 'wrap' }}
        useFlexGap
        component="dl"
        data-testid="insight-stats"
      >
        <Stat label="収録知見" value={`${entries.length} 件`} />
        {INSIGHT_CATEGORY_FILTERS.filter((f) => f.value !== 'all').map((filter) => (
          <Stat
            key={filter.value}
            label={INSIGHT_CATEGORY_META[filter.value as keyof typeof INSIGHT_CATEGORY_META].label}
            value={`${categoryCounts[filter.value as keyof typeof categoryCounts]} 件`}
          />
        ))}
        {period && (
          <Stat
            label="収録期間"
            value={`${formatFullDate(period.from)} 〜 ${formatFullDate(period.to)}`}
          />
        )}
      </Stack>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        sx={{ mt: 3 }}
      >
        <ButtonGroup size="small" aria-label="知見をカテゴリで絞り込む">
          {INSIGHT_CATEGORY_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              onClick={() => setCategory(filter.value)}
              variant={category === filter.value ? 'contained' : 'outlined'}
              aria-pressed={category === filter.value}
            >
              {filter.label}
            </Button>
          ))}
        </ButtonGroup>
      </Stack>

      {/*
       * 絞り込みで残る知見の件数とテーマ数が変わったことは aria-pressed からしか
       * 分からない。件数と空状態を live region で通知する（年表本体と同じ扱い）
       */}
      <Box role="status" aria-live="polite" aria-atomic="true" sx={{ mt: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {tracks.length === 0
            ? '条件に合う知見がありません。絞り込みを外してください。'
            : `${filtered.length} 件を ${tracks.length} テーマで表示中`}
        </Typography>
      </Box>

      <Box sx={{ mt: 2 }}>
        {tracks.map((track, index) => (
          <Accordion
            key={track.themeId}
            expanded={isOpen(track.themeId, index)}
            onChange={() => toggle(track.themeId, index)}
            disableGutters
            elevation={0}
            square
            /*
             * 閉じたトラックの中身を DOM に残さない。テーマは 29 本あり、残したままだと
             * 初回表示で 500 枚のカードが載る（実測）。開いている 3 本だけを描く
             */
            slotProps={{ transition: { unmountOnExit: true } }}
            sx={{
              bgcolor: 'transparent',
              borderTop: '1px solid',
              borderColor: 'divider',
              '&:last-of-type': {
                borderBottom: '1px solid',
                borderColor: 'divider',
              },
              '&::before': { display: 'none' },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              /*
               * aria-controls は開いている間だけ出す。閉じたトラックは unmountOnExit で
               * DOM から消えるため、常に出すと参照先の無い id を指すことになる
               */
              aria-controls={isOpen(track.themeId, index) ? `${track.themeId}-entries` : undefined}
              id={`${track.themeId}-header`}
            >
              {/*
               * 見出し要素を自前で置かない。MUI の AccordionSummary は既定で
               * <h3 class="MuiAccordion-heading"> に包まれるため、ここで component="h3" を
               * 指定すると h3 の中に h3 が入り、支援技術には見出しが 2 つ重なって見える。
               * 階層（h1 年表 → h2 知見の経緯 → h3 テーマ）は MUI の既定でちょうど合う
               */}
              <Stack direction="row" spacing={1.5} alignItems="baseline" flexWrap="wrap" useFlexGap>
                <Typography variant="subtitle1" component="span" sx={{ fontWeight: 600 }}>
                  {track.label}
                </Typography>
                {/* 見出しの読み上げでラベルと件数が続けて繋がらないよう、空白を 1 つ挟む */}{' '}
                <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
                  {`${track.entries.length} 件 · ${formatSpan(track.from, track.to)}`}
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>
                {track.description}
              </Typography>
              <Box
                component="ul"
                id={`${track.themeId}-entries`}
                sx={{ listStyle: 'none', p: 0, m: 0 }}
              >
                {visibleEntries(track).map((entry) => (
                  <InsightCard
                    key={entry.id}
                    entry={entry}
                    currentThemeId={track.themeId}
                    themeLabels={themeLabels}
                  />
                ))}
              </Box>
              {/*
               * 押したらボタンを消す、をしない。押下と同時に unmount すると、キーボードで
               * 操作した人のフォーカスが body へ飛び、160 件超のリストの読み位置を失う。
               * ラベルを変えて disabled にし、フォーカスの置き場所を残す
               */}
              {track.entries.length > INSIGHT_TRACK_PREVIEW_COUNT && (
                <Button
                  size="small"
                  disabled={hiddenCount(track) === 0}
                  onClick={() => showAll(track.themeId)}
                  sx={{ mt: 1.5 }}
                  aria-controls={`${track.themeId}-entries`}
                >
                  {hiddenCount(track) > 0 ? `残り ${hiddenCount(track)} 件を表示` : '全件を表示中'}
                </Button>
              )}
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Box>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Box>
      <Typography component="dt" variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography
        component="dd"
        variant="subtitle1"
        sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
    </Box>
  );
}
