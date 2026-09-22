'use client';

import {
  Box,
  Button,
  ButtonGroup,
  Container,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';

import type { InsightEntry, InsightTheme } from '../../../lib/insightTimeline/types';
import { groupByMonthDescending, summarizeByMonth } from '../../../lib/releaseTimeline/normalize';
import type { ReleaseEntry } from '../../../lib/releaseTimeline/types';
import InsightTrack from './components/InsightTrack';
import ReleaseCadence from './components/ReleaseCadence';
import ReleaseCard from './components/ReleaseCard';
import {
  formatFullDate,
  formatMonth,
  TRACK_ANNOUNCEMENT,
  TRACK_FILTERS,
  type TrackFilter,
} from './constants';

interface Period {
  readonly from: string;
  readonly to: string;
}

interface Props {
  readonly release: {
    readonly entries: readonly ReleaseEntry[];
    readonly sourceReportCount: number;
    readonly period: Period | null;
  };
  readonly insight: {
    readonly entries: readonly InsightEntry[];
    readonly themes: readonly InsightTheme[];
    readonly sourceReportCount: number;
    readonly period: Period | null;
  };
}

/**
 * 年表ページの本体。
 *
 * 先頭のボタン群は種別の絞り込みではなく**表示の切り替え**で、リリースと知見の
 * どちらを（あるいは両方を）出すかを決める。知見を常設のセクションとして下に置くのを
 * やめたのは、同じ内容がフィルタの外に二重で並ぶとどちらが正なのか読み手に判らないため。
 */
export default function TimelineBody({ release, insight }: Props) {
  const [track, setTrack] = useState<TrackFilter>('all');
  const [highOnly, setHighOnly] = useState(false);

  const showRelease = track !== 'insight';
  const showInsight = track === 'all' || track === 'insight';

  const filtered = useMemo(
    () =>
      release.entries.filter(
        (entry) =>
          (track === 'all' || entry.kind === track) && (!highOnly || entry.impact === 'high'),
      ),
    [release.entries, track, highOnly],
  );

  // 件数バーは絞り込みに追従させる。全期間固定にすると、絞った結果とグラフが別の話をする
  const months = useMemo(() => summarizeByMonth(filtered), [filtered]);
  // 一覧は新しい順（上ほど最近）。件数バーは左から右へ時間が流れる読み方を崩さないため昇順のまま
  const grouped = useMemo(() => groupByMonthDescending(filtered), [filtered]);

  const cliCount = release.entries.filter((e) => e.kind === 'cli').length;
  const modelCount = release.entries.length - cliCount;
  const highCount = release.entries.filter((e) => e.impact === 'high').length;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <Box component="header" sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Claude Code 年表
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: '60ch', lineHeight: 1.8 }}
        >
          {/* JSX は改行とインデントを空白 1 つへ畳むため、日本語文を行で割ると
              「リリースを、 時系列」のように不要な空白が入る。1 式にまとめる */}
          {
            '日次・週次の技術調査レポートが観測した Claude Code の変化を、リリースと知見の 2 つの軸で並べたものです。'
          }
        </Typography>
      </Box>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
      >
        <ButtonGroup size="small" aria-label="表示する内容を切り替える">
          {TRACK_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              onClick={() => setTrack(filter.value)}
              variant={track === filter.value ? 'contained' : 'outlined'}
              aria-pressed={track === filter.value}
            >
              {filter.label}
            </Button>
          ))}
        </ButtonGroup>
        {showRelease && (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={highOnly}
                onChange={(e) => setHighOnly(e.target.checked)}
              />
            }
            label="影響度 高のみ"
          />
        )}
      </Stack>

      {/*
       * 切り替えると画面の中身が丸ごと入れ替わる。各セクションの件数表示も live region だが、
       * 新しく DOM へ挿入された live region は読み上げられないことがあるので、常に存在する
       * この 1 つで「今どれを見ているか」を伝える
       */}
      <Box role="status" aria-live="polite" aria-atomic="true" sx={{ mt: 1.5 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {TRACK_ANNOUNCEMENT[track]}
        </Typography>
      </Box>

      {showRelease && (
        <Box component="section" sx={{ mt: 4 }} aria-labelledby="release-track-heading">
          <Typography id="release-track-heading" variant="h5" component="h2" gutterBottom>
            リリース
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: '60ch', lineHeight: 1.8 }}
          >
            {`Claude Code 本体と Claude モデルのリリースを、新しい順（上ほど最近）に並べたものです。changelog の全件ではなく、${release.sourceReportCount} 本のレポートが実際に取り上げたリリースを収録しています。`}
          </Typography>

          <Stack
            direction="row"
            spacing={{ xs: 2, sm: 4 }}
            sx={{ mt: 3, mb: 3, flexWrap: 'wrap' }}
            useFlexGap
            component="dl"
          >
            <Stat label="収録リリース" value={`${release.entries.length} 件`} />
            <Stat label="Claude Code" value={`${cliCount} 件`} />
            <Stat label="Claude モデル" value={`${modelCount} 件`} />
            <Stat label="影響度 高" value={`${highCount} 件`} />
            {release.period && (
              <Stat
                label="収録期間"
                value={`${formatFullDate(release.period.from)} 〜 ${formatFullDate(release.period.to)}`}
              />
            )}
          </Stack>

          <Divider />

          {/*
           * 絞り込みは 98 件を最小 6 件まで入れ替える主操作なのに、結果件数が変わったことは
           * aria-pressed の変化からしか分からない。件数と空状態を live region で通知する。
           * 一覧そのものを live region にはしない（98 ノードの全変更が読み上げ対象になる）
           */}
          <Box role="status" aria-live="polite" aria-atomic="true" sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {filtered.length === 0
                ? '条件に合うリリースがありません。絞り込みを外してください。'
                : `${filtered.length} 件を表示中`}
            </Typography>
          </Box>

          <ReleaseCadence months={months} />

          {filtered.length > 0 &&
            grouped.map(([month, monthEntries]) => (
              <Box
                component="section"
                key={month}
                sx={{ mt: 4 }}
                aria-labelledby={`month-${month}`}
              >
                <Typography
                  id={`month-${month}`}
                  variant="h6"
                  component="h3"
                  sx={{
                    position: 'sticky',
                    top: 64,
                    zIndex: 1,
                    py: 1,
                    bgcolor: 'background.default',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  {formatMonth(month)}
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ ml: 1.5, color: 'text.secondary' }}
                  >
                    {monthEntries.length} 件
                  </Typography>
                </Typography>
                <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                  {monthEntries.map((entry) => (
                    <ReleaseCard key={entry.id} entry={entry} />
                  ))}
                </Box>
              </Box>
            ))}

          <Typography
            variant="caption"
            component="p"
            sx={{ mt: 6, color: 'text.disabled', lineHeight: 1.8 }}
          >
            {
              '出典は各リリースの「変更点」を開くと確認できます。日付にヘルプアイコンが付くものは、レポート本文にリリース日の明記が無く、レポート発行日で代用した推定日です。'
            }
          </Typography>
        </Box>
      )}

      {showInsight && (
        <Box sx={{ mt: showRelease ? 8 : 4 }}>
          <InsightTrack
            entries={insight.entries}
            themes={insight.themes}
            sourceReportCount={insight.sourceReportCount}
            period={insight.period}
          />
        </Box>
      )}
    </Container>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Box>
      <Typography component="dt" variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography component="dd" variant="h6" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );
}
