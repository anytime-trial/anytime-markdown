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

import { summarizeByMonth } from '../../../lib/releaseTimeline/normalize';
import type { ReleaseEntry } from '../../../lib/releaseTimeline/types';
import ReleaseCadence from './components/ReleaseCadence';
import ReleaseCard from './components/ReleaseCard';
import { formatFullDate, formatMonth, KIND_FILTERS, type KindFilter } from './constants';

interface Props {
  readonly entries: readonly ReleaseEntry[];
  readonly sourceReportCount: number;
  readonly period: { readonly from: string; readonly to: string } | null;
}

function groupByMonth(entries: readonly ReleaseEntry[]): [string, ReleaseEntry[]][] {
  const groups = new Map<string, ReleaseEntry[]>();
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const bucket = groups.get(month);
    if (bucket) bucket.push(entry);
    else groups.set(month, [entry]);
  }
  return [...groups.entries()];
}

export default function TimelineBody({ entries, sourceReportCount, period }: Props) {
  const [kind, setKind] = useState<KindFilter>('all');
  const [highOnly, setHighOnly] = useState(false);

  const filtered = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (kind === 'all' || entry.kind === kind) && (!highOnly || entry.impact === 'high'),
      ),
    [entries, kind, highOnly],
  );

  // 件数バーは絞り込みに追従させる。全期間固定にすると、絞った結果とグラフが別の話をする
  const months = useMemo(() => summarizeByMonth(filtered), [filtered]);
  const grouped = useMemo(() => groupByMonth(filtered), [filtered]);

  const cliCount = entries.filter((e) => e.kind === 'cli').length;
  const modelCount = entries.length - cliCount;
  const highCount = entries.filter((e) => e.impact === 'high').length;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <Box component="header" sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Claude Code リリース年表
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: '60ch', lineHeight: 1.8 }}
        >
          {/* JSX は改行とインデントを空白 1 つへ畳むため、日本語文を行で割ると
              「リリースを、 時系列」のように不要な空白が入る。1 式にまとめる */}
          {`日次技術調査レポートが観測した Claude Code 本体と Claude モデルのリリースを、時系列に並べたものです。changelog の全件ではなく、${sourceReportCount} 本のレポートが実際に取り上げたリリースを収録しています。`}
        </Typography>
      </Box>

      <Stack
        direction="row"
        spacing={{ xs: 2, sm: 4 }}
        sx={{ mb: 3, flexWrap: 'wrap' }}
        useFlexGap
        component="dl"
      >
        <Stat label="収録リリース" value={`${entries.length} 件`} />
        <Stat label="Claude Code" value={`${cliCount} 件`} />
        <Stat label="Claude モデル" value={`${modelCount} 件`} />
        <Stat label="影響度 高" value={`${highCount} 件`} />
        {period && (
          <Stat
            label="収録期間"
            value={`${formatFullDate(period.from)} 〜 ${formatFullDate(period.to)}`}
          />
        )}
      </Stack>

      <Divider />

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        sx={{ mt: 3 }}
      >
        <ButtonGroup size="small" aria-label="種別で絞り込む">
          {KIND_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              onClick={() => setKind(filter.value)}
              variant={kind === filter.value ? 'contained' : 'outlined'}
              aria-pressed={kind === filter.value}
            >
              {filter.label}
            </Button>
          ))}
        </ButtonGroup>
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
      </Stack>

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
          <Box component="section" key={month} sx={{ mt: 4 }} aria-labelledby={`month-${month}`}>
            <Typography
              id={`month-${month}`}
              variant="h6"
              component="h2"
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
        {'出典は各リリースの「変更点」を開くと確認できます。日付にヘルプアイコンが付くものは、レポート本文にリリース日の明記が無く、レポート発行日で代用した推定日です。'}
      </Typography>
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
