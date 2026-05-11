import * as React from 'react';
import { ScatterChart } from '@mui/x-charts/ScatterChart';
import { Box, Stack, Typography } from '@mui/material';
import type { FunctionRole } from '@anytime-markdown/trail-core/c4';
import type { FunctionAnalysisApiEntry } from '../../hooks/fetchFunctionAnalysisApi';

interface Colors {
  readonly border: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
}

export interface FunctionScatterPlotProps {
  readonly entries: readonly FunctionAnalysisApiEntry[];
  readonly t: (key: string) => string;
  readonly colors: Colors;
  readonly onFunctionOpen?: (filePath: string, functionName: string, startLine: number) => void;
  readonly filterElementId?: string | null;
}

const ROLE_COLORS: Record<FunctionRole, string> = {
  hub: '#c62828',
  orchestrator: '#f9a825',
  leaf: '#2e7d32',
  peripheral: '#9e9e9e',
};

export type ComplexityTier = 'low' | 'mid' | 'high';

export interface TierConfig {
  readonly tier: ComplexityTier;
  readonly markerSize: number;
  readonly label: string;
}

export const COMPLEXITY_TIERS: readonly TierConfig[] = [
  { tier: 'low',  markerSize: 4,  label: '0–4' },
  { tier: 'mid',  markerSize: 9,  label: '5–14' },
  { tier: 'high', markerSize: 16, label: '15+' },
];

export function assignComplexityTier(cognitiveComplexity: number): ComplexityTier {
  if (cognitiveComplexity <= 4) return 'low';
  if (cognitiveComplexity <= 14) return 'mid';
  return 'high';
}

export interface BubbleSeriesItem {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly markerSize: number;
  readonly data: ReadonlyArray<{ readonly x: number; readonly y: number; readonly id: string }>;
}

export function buildBubbleSeries(
  entries: readonly FunctionAnalysisApiEntry[],
): BubbleSeriesItem[] {
  const result: BubbleSeriesItem[] = [];
  for (const role of ALL_ROLES) {
    for (const tierConfig of COMPLEXITY_TIERS) {
      const filtered = entries.filter(
        (e) => e.functionRole === role && assignComplexityTier(e.cognitiveComplexity) === tierConfig.tier,
      );
      if (filtered.length === 0) continue;
      result.push({
        id: `${role}-${tierConfig.tier}`,
        label: `${role} (${tierConfig.label})`,
        color: ROLE_COLORS[role],
        markerSize: tierConfig.markerSize,
        data: filtered.map((entry, idx) => ({
          x: entry.fanIn,
          y: entry.fanOut,
          id: `${role}-${tierConfig.tier}-${idx}`,
        })),
      });
    }
  }
  return result;
}

const ALL_ROLES: readonly FunctionRole[] = ['hub', 'orchestrator', 'leaf', 'peripheral'];

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export const FunctionScatterPlot: React.FC<FunctionScatterPlotProps> = ({
  entries,
  t,
  colors,
  onFunctionOpen,
}) => {
  if (entries.length === 0) {
    return (
      <Box sx={{ borderTop: `1px solid ${colors.border}`, mt: 2, pt: 1, px: 1 }}>
        <Typography variant="caption" sx={{ color: colors.textMuted }}>
          {t('c4.scatter.empty')}
        </Typography>
      </Box>
    );
  }

  // 中央値は将来の軸アノテーション用に計算しておく
  const _medianFanIn = median(entries.map((e) => e.fanIn));
  const _medianFanOut = median(entries.map((e) => e.fanOut));

  // role ごとにエントリを分類
  const grouped: Record<FunctionRole, FunctionAnalysisApiEntry[]> = {
    hub: [],
    orchestrator: [],
    leaf: [],
    peripheral: [],
  };
  for (const entry of entries) {
    grouped[entry.functionRole].push(entry);
  }

  const series = ALL_ROLES.map((role) => ({
    id: role,
    label: role,
    color: ROLE_COLORS[role],
    markerSize: 6,
    data: grouped[role].map((entry, idx) => ({
      x: entry.fanIn,
      y: entry.fanOut,
      id: `${role}-${idx}`,
    })),
  }));

  const handleItemClick = (
    _event: React.MouseEvent<SVGElement, MouseEvent>,
    itemIdentifier: { seriesId: string | number; dataIndex: number },
  ): void => {
    if (!onFunctionOpen) return;
    const roleKey = typeof itemIdentifier.seriesId === 'string'
      ? (itemIdentifier.seriesId as FunctionRole)
      : undefined;
    if (roleKey === undefined) return;
    const entry = grouped[roleKey]?.[itemIdentifier.dataIndex];
    if (!entry) return;
    onFunctionOpen(entry.filePath, entry.functionName, entry.startLine);
  };

  return (
    <Box
      sx={{
        borderTop: `1px solid ${colors.border}`,
        mt: 2,
        pt: 1,
        px: 1,
      }}
    >
      {/* タイトル */}
      <Typography
        variant="subtitle2"
        sx={{ color: colors.textSecondary, fontWeight: 700, mb: 0.5 }}
      >
        {t('c4.scatter.title')}
      </Typography>

      {/* 凡例 */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 1, flexWrap: 'wrap' }}>
        {ALL_ROLES.map((role) => (
          <Stack key={role} direction="row" alignItems="center" spacing={0.5}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: ROLE_COLORS[role],
                flexShrink: 0,
              }}
            />
            <Typography
              variant="caption"
              sx={{ color: colors.textSecondary, fontSize: '0.65rem' }}
            >
              {role} ({grouped[role].length})
            </Typography>
          </Stack>
        ))}
      </Stack>

      {/* 散布図 */}
      <Box sx={{ width: '100%', height: 320 }}>
        <ScatterChart
          series={series}
          grid={{ vertical: true, horizontal: true }}
          onItemClick={handleItemClick}
          hideLegend
          sx={{ width: '100%', height: '100%' }}
        />
      </Box>
    </Box>
  );
};

