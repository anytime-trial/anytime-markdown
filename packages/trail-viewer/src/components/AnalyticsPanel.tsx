import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { BarChart, BarPlot } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { ChartsDataProvider } from '@mui/x-charts/ChartsDataProvider';
import { ChartsSurface } from '@mui/x-charts/ChartsSurface';
import { ChartsWrapper } from '@mui/x-charts/ChartsWrapper';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import {
  ChartsTooltip,
  ChartsTooltipContainer,
  ChartsTooltipPaper,
  ChartsTooltipTable,
  ChartsTooltipRow,
  ChartsTooltipCell,
  useAxesTooltip,
} from '@mui/x-charts/ChartsTooltip';
import { ChartsLabelMark } from '@mui/x-charts/ChartsLabel';
import { ChartsGrid } from '@mui/x-charts/ChartsGrid';
import { ChartsLegend } from '@mui/x-charts/ChartsLegend';
import { ChartsAxisHighlight } from '@mui/x-charts/ChartsAxisHighlight';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { useDrawingArea, useXScale } from '@mui/x-charts/hooks';
import { formatLocalTime, toLocalDateKey } from '@anytime-markdown/trail-core/formatDate';
import { extractCommitPrefix } from '@anytime-markdown/trail-core/domain';
import type { QualityMetrics, DateRange, ReleaseQualityBucket } from '@anytime-markdown/trail-core/domain/metrics';
import type { AnalyticsData, CombinedData, CombinedPeriodMode, CombinedRangeDays, CostOptimizationData, ToolMetrics, TrailMessage, TrailSession, TrailSessionCommit, TrailTokenUsage, TrailToolCall } from '../parser/types';
import { useTrailTheme } from './TrailThemeContext';
import { useTrailI18n } from '../i18n';

export interface AnalyticsPanelProps {
  readonly analytics: AnalyticsData | null;
  readonly sessions?: readonly TrailSession[];
  readonly onSelectSession?: (id: string) => void;
  readonly onJumpToTrace?: (session: TrailSession) => void;
  readonly fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  readonly fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  readonly fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  readonly fetchDayToolMetrics?: (date: string) => Promise<ToolMetrics | null>;
  readonly costOptimization?: CostOptimizationData | null;
  readonly fetchCombinedData?: (period: CombinedPeriodMode, rangeDays: CombinedRangeDays) => Promise<CombinedData>;
  readonly fetchQualityMetrics?: (range: DateRange) => Promise<QualityMetrics | null>;
  readonly fetchDeploymentFrequency?: (range: DateRange, bucket: 'day' | 'week') => Promise<ReadonlyArray<{ bucketStart: string; value: number }>>;
  readonly fetchReleaseQuality?: (range: DateRange, bucket: 'day' | 'week') => Promise<ReadonlyArray<ReleaseQualityBucket>>;
  readonly sessionsLoading?: boolean;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtUsdShort(n: number): string {
  if (n >= 1_000) return `$${parseFloat((n / 1_000).toFixed(1))}K`;
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${parseFloat((n / 1_000_000_000).toFixed(1))}B`;
  if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${parseFloat((n / 1_000).toFixed(1))}K`;
  return String(n);
}

// Return up to ~5 "nice" tick values covering [0, max]. Minimum step is 1 (no fractions).
function PieCenterLabel({ value, color }: Readonly<{ value: number; color: string }>) {
  const { width, height, left, top } = useDrawingArea();
  return (
    <text
      x={left + width / 2}
      y={top + height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: '1.5rem', fontWeight: 600, fill: color, pointerEvents: 'none' }}
    >
      {value}
    </text>
  );
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const rawStep = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const step = Math.max(1, rawStep);
  const values: number[] = [];
  const end = Math.ceil(max / step) * step;
  for (let v = 0; v <= end + step / 2; v += step) values.push(v);
  return values;
}


// Cost rates removed — backend now provides pre-calculated estimatedCostUsd

type DailyViewMode = 'tokens' | 'cost';
type PeriodDays = 7 | 30 | 90;

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------

interface MetricItem {
  readonly label: string;
  readonly value: string;
  readonly badge?: { readonly label: string; readonly color: string };
  readonly delta?: { readonly text: string; readonly color: string };
}

function CyclingCard({
  groupName,
  items,
  index,
  onCycle,
  cardStyle,
}: Readonly<{
  groupName: string;
  items: readonly MetricItem[];
  index: number;
  onCycle: () => void;
  cardStyle: SxProps<Theme>;
}>) {
  const current = items[index];
  return (
    <Paper
      elevation={0}
      sx={{
        ...cardStyle,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        '&:hover': { backgroundColor: 'action.hover' },
        userSelect: 'none',
      }}
      onClick={onCycle}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, alignSelf: 'flex-start' }}>
        {groupName}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography variant="h5">{current.value}</Typography>
        {current.badge && (
          <Chip
            label={current.badge.label}
            size="small"
            sx={{ backgroundColor: current.badge.color, color: '#fff', fontWeight: 700, height: 20, fontSize: 10 }}
          />
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {current.label}
        </Typography>
        {current.delta && (
          <Typography variant="caption" sx={{ color: current.delta.color }}>
            {current.delta.text}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mt: 1 }}>
        {items.map((item, i) => (
          <Box
            key={item.label}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: i === index ? 'primary.main' : 'action.disabled',
            }}
          />
        ))}
      </Box>
    </Paper>
  );
}

function formatDoraValue(m: { value: number; unit: string }): string {
  if (m.unit === 'perDay') {
    return m.value >= 1 ? `${m.value.toFixed(1)}/day` : m.value > 0 ? `${(m.value * 7).toFixed(1)}/week` : '0/day';
  }
  if (m.unit === 'minPerLoc') {
    return m.value < 60 ? `${m.value.toFixed(2)} min/LOC` : `${(m.value / 60).toFixed(1)} h/LOC`;
  }
  if (m.unit === 'tokensPerLoc') {
    return m.value >= 1000 ? `${(m.value / 1000).toFixed(1)}k tok/LOC` : `${m.value.toFixed(0)} tok/LOC`;
  }
  return `${m.value.toFixed(1)}%`;
}

function OverviewCards({
  totals,
  sessions = [],
  qualityMetrics = null,
}: Readonly<{
  totals: AnalyticsData['totals'];
  sessions?: readonly TrailSession[];
  qualityMetrics?: QualityMetrics | null;
}>) {
  const { colors, cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [usageIdx, setUsageIdx] = useState(0);
  const totalTokens = totals.inputTokens + totals.outputTokens;

  const cards = [
    { label: t('analytics.totalSessions'), value: fmtNum(totals.sessions) },
    { label: t('analytics.totalTokens'), value: fmtTokens(totalTokens) },
    { label: t('analytics.estimatedCost'), value: fmtUsd(totals.estimatedCostUsd) },
    { label: t('analytics.totalCommits'), value: fmtNum(totals.totalCommits) },
    { label: t('analytics.linesAdded'), value: fmtNum(totals.totalLinesAdded) },
  ];

  const DORA_ID_KEYS: Record<string, string> = {
    deploymentFrequency: 'metrics.deploymentFrequency.name',
    leadTimePerLoc: 'metrics.leadTimePerLoc.name',
    tokensPerLoc: 'metrics.tokensPerLoc.name',
    aiFirstTrySuccessRate: 'metrics.aiFirstTrySuccessRate.name',
    changeFailureRate: 'metrics.changeFailureRate.name',
  };
  const LEVEL_COLORS: Record<string, string> = {
    elite: isDark ? '#42A5F5' : '#1976D2',
    high: isDark ? '#66BB6A' : '#2E7D32',
    medium: isDark ? '#FFA726' : '#ED6C02',
    low: isDark ? '#F44336' : '#D32F2F',
  };
  const LEVEL_LABELS: Record<string, string> = {
    elite: 'Elite', high: 'High', medium: 'Medium', low: 'Low',
  };
  const doraCards = qualityMetrics
    ? Object.values(qualityMetrics.metrics)
        .filter((m) => m.sampleSize > 0)
        .map((m) => {
          const deltaPct = m.comparison?.deltaPct ?? null;
          return {
            value: formatDoraValue(m),
            label: t((DORA_ID_KEYS[m.id] ?? m.id) as Parameters<typeof t>[0]),
            badge: m.level ? { label: LEVEL_LABELS[m.level], color: LEVEL_COLORS[m.level] } : undefined,
            delta: deltaPct != null ? {
              text: `${deltaPct > 0 ? '↑' : deltaPct < 0 ? '↓' : '→'} ${Math.abs(deltaPct).toFixed(1)}%`,
              color: deltaPct > 0 ? 'success.main' : deltaPct < 0 ? 'error.main' : 'text.secondary',
            } : undefined,
          };
        })
    : [];

  const cardStyle = { ...cardSx, flex: '1 1 140px', p: 2, minWidth: 140, textAlign: 'center' } as const;

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <CyclingCard
        groupName={t('analytics.groupUsage')}
        items={cards}
        index={usageIdx}
        onCycle={() => setUsageIdx((i) => (i + 1) % cards.length)}
        cardStyle={cardStyle}
      />
      {doraCards.map((card) => (
        <Paper key={card.label} elevation={0} sx={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, alignSelf: 'flex-start' }}>
            {card.label}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h5">{card.value}</Typography>
            {card.badge && (
              <Chip
                label={card.badge.label}
                size="small"
                sx={{ backgroundColor: card.badge.color, color: '#fff', fontWeight: 700, height: 20, fontSize: 10 }}
              />
            )}
          </Box>
          {card.delta && (
            <Typography variant="caption" sx={{ color: card.delta.color }}>
              {card.delta.text}
            </Typography>
          )}
        </Paper>
      ))}
    </Box>
  );
}

function ToolUsageChart({ items }: Readonly<{ items: AnalyticsData['toolUsage'] }>) {
  const { colors, chartColors, radius } = useTrailTheme();
  const { t } = useTrailI18n();
  if (items.length === 0) return null;
  const maxCount = items[0].count;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {t('analytics.toolUsageTitle')}
      </Typography>
      {items.map((item) => (
        <Box key={item.name} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Typography
            variant="body2"
            sx={{ width: 120, flexShrink: 0, textAlign: 'right', pr: 1, fontFamily: 'monospace' }}
          >
            {item.name}
          </Typography>
          <Box
            sx={{
              height: 18,
              width: `${(item.count / maxCount) * 100}%`,
              minWidth: 4,
              bgcolor: chartColors.primary,
              borderRadius: radius.sm,
            }}
          />
          <Typography variant="caption" sx={{ pl: 1, whiteSpace: 'nowrap' }}>
            {fmtNum(item.count)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function fmtDurationShort(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  const s = ms / 1_000;
  if (s < 60) return `${s.toFixed(0)}s`;
  const min = s / 60;
  if (min < 60) return `${min.toFixed(1)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function fmtPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}

function sessionCost(s: TrailSession): number {
  return s.estimatedCostUsd ?? 0;
}

// 連続する assistant ターンで cacheRead が急落した回数をカウント。
// auto /compact の特徴: 直前 50K 以上積まれていて、次ターンで 70% 以上減少。
function countCompactDrops(msgs: readonly TrailMessage[]): number {
  const MIN_BEFORE = 50_000;
  const DROP_RATIO = 0.3; // 直前の 30% 以下 = 70% 以上減少
  let count = 0;
  for (let i = 1; i < msgs.length; i++) {
    const prev = msgs[i - 1].usage?.cacheReadTokens ?? 0;
    const cur = msgs[i].usage?.cacheReadTokens ?? 0;
    if (prev >= MIN_BEFORE && cur <= prev * DROP_RATIO) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
//  Marker types & helpers
// ---------------------------------------------------------------------------

interface CommitMarkerData {
  readonly turn: number;
  readonly agentLabel: string;
  readonly commitHash: string;
  readonly commitPrefix: string;
}

interface ErrorMarkerData {
  readonly turn: number;
  readonly agentLabel: string;
  readonly toolName: string;
}

function parseCommitSubject(cmd: string): string {
  // heredoc: <<'EOF' ... EOF  (Claude Code standard format)
  const heredocMatch = /<<'?EOF'?\n([\s\S]+?)\n\s*EOF/.exec(cmd);
  if (heredocMatch) return heredocMatch[1].trim().split('\n')[0].trim();
  // simple -m "..."
  const simpleMatch = /-m\s+"((?:[^"\\]|\\.)*)"/.exec(cmd);
  if (simpleMatch) return simpleMatch[1].replace(/\\n/g, '\n').split('\n')[0].trim();
  return '';
}

function extractPrefixWithScope(subject: string): string {
  const match = /^([a-z]+(?:\([^)]*\))?!?):/i.exec(subject);
  return match ? match[1] : subject.slice(0, 40);
}

// ---------------------------------------------------------------------------
//  CommitMarkers / ErrorMarkers — inverted-triangle markers with tooltips
// ---------------------------------------------------------------------------

function CommitMarkers({ markers }: Readonly<{ markers: readonly CommitMarkerData[] }>) {
  const { top } = useDrawingArea();
  const xScale = useXScale();
  if (markers.length === 0) return null;
  const SIZE = 6;
  const HEIGHT = 9;
  return (
    <>
      {markers.map(({ turn, agentLabel, commitHash, commitPrefix }) => {
        const cx = xScale(turn as never) as number | undefined;
        if (cx == null) return null;
        const points = `${cx - SIZE},${top - HEIGHT} ${cx + SIZE},${top - HEIGHT} ${cx},${top}`;
        return (
          <Tooltip
            key={turn}
            placement="top"
            title={
              <Box sx={{ p: 0.25 }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block' }}>{agentLabel}</Typography>
                {commitHash && <Typography variant="caption" sx={{ display: 'block' }}>ID: {commitHash}</Typography>}
                {commitPrefix && <Typography variant="caption" sx={{ display: 'block' }}>{commitPrefix}</Typography>}
              </Box>
            }
          >
            <g style={{ cursor: 'pointer' }}>
              <polygon points={points} fill="#4CAF50" opacity={0.9} />
            </g>
          </Tooltip>
        );
      })}
    </>
  );
}

function ErrorMarkers({ markers }: Readonly<{ markers: readonly ErrorMarkerData[] }>) {
  const { top } = useDrawingArea();
  const xScale = useXScale();
  if (markers.length === 0) return null;
  const SIZE = 4;
  const HEIGHT = 6;
  return (
    <>
      {markers.map(({ turn, agentLabel, toolName }) => {
        const cx = xScale(turn as never) as number | undefined;
        if (cx == null) return null;
        const points = `${cx - SIZE},${top - HEIGHT} ${cx + SIZE},${top - HEIGHT} ${cx},${top}`;
        return (
          <Tooltip
            key={turn}
            placement="top"
            title={
              <Box sx={{ p: 0.25 }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block' }}>{agentLabel}</Typography>
                {toolName && <Typography variant="caption" sx={{ display: 'block' }}>Tool: {toolName}</Typography>}
              </Box>
            }
          >
            <g style={{ cursor: 'pointer' }}>
              <polygon points={points} fill="#F44336" opacity={0.9} />
            </g>
          </Tooltip>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
//  TurnLaneChart — model & tool-usage lanes aligned to turn count
// ---------------------------------------------------------------------------

const LANE_TOOL_CATS = ['bash', 'edit', 'write', 'read', 'task', 'other'] as const;
type LaneTool = (typeof LANE_TOOL_CATS)[number];

const LANE_TOOL_COLORS: Record<LaneTool, string> = {
  bash: '#4CAF50', edit: '#2196F3', write: '#9C27B0',
  read: '#757575', task: '#FFB300', other: '#FF9800',
};
const LANE_TOOL_LABELS: Record<LaneTool, string> = {
  bash: 'Bash', edit: 'Edit', write: 'Write', read: 'Read', task: 'Task', other: 'Other',
};

function laneClassifyTool(name: string): LaneTool {
  if (name === 'Bash') return 'bash';
  if (name === 'Edit' || name === 'MultiEdit') return 'edit';
  if (name === 'Write') return 'write';
  if (name === 'Read' || name === 'Glob' || name === 'Grep') return 'read';
  if (name === 'Task' || name.startsWith('mcp__')) return 'task';
  return 'other';
}

function laneModelColor(model: string): string {
  if (model.includes('opus')) return '#7C4DFF';
  if (model.includes('sonnet')) return '#42A5F5';
  if (model.includes('haiku')) return '#66BB6A';
  return '#90A4AE';
}

const SKILL_COLOR_PALETTE = [
  '#EC4899', '#14B8A6', '#F59E0B', '#8b5cf6', '#EF4444', '#10B981', '#3B82F6', '#F97316',
];

function laneSkillColor(skill: string): string {
  let hash = 0;
  for (let i = 0; i < skill.length; i++) hash = ((hash * 31) + skill.charCodeAt(i)) & 0xFFFFFF;
  return SKILL_COLOR_PALETTE[Math.abs(hash) % SKILL_COLOR_PALETTE.length];
}

function mergeRuns<T>(values: readonly T[]): Array<{ value: T; start: number; end: number }> {
  const runs: Array<{ value: T; start: number; end: number }> = [];
  for (let i = 0; i < values.length; i++) {
    const last = runs.at(-1);
    if (last && last.value === values[i]) {
      last.end = i;
    } else {
      runs.push({ value: values[i], start: i, end: i });
    }
  }
  return runs;
}

function dominantTool(toolCalls: readonly TrailToolCall[] | undefined): LaneTool | '' {
  if (!toolCalls || toolCalls.length === 0) return '';
  for (const cat of LANE_TOOL_CATS) {
    if (toolCalls.some((tc) => laneClassifyTool(tc.name) === cat)) return cat;
  }
  return '';
}

function TurnLaneChart({
  assistantMsgs,
  tickStep,
  commitTurns,
  errorTurns,
}: Readonly<{
  assistantMsgs: readonly TrailMessage[];
  tickStep: number;
  commitTurns?: readonly number[];
  errorTurns?: readonly number[];
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgWidth, setSvgWidth] = useState(600);
  const { colors } = useTrailTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      setSvgWidth(entries[0].contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const mainModelRuns = useMemo(() =>
    mergeRuns(assistantMsgs.map((m) => m.agentId ? '' : (m.model ?? ''))),
    [assistantMsgs],
  );

  const toolRuns = useMemo(() =>
    mergeRuns(assistantMsgs.map((m) => m.agentId ? '' : dominantTool(m.toolCalls))).filter((r) => r.value !== ''),
    [assistantMsgs],
  );

  const subAgents = useMemo(() => {
    const seen = new Map<string, string | undefined>();
    for (const m of assistantMsgs) {
      if (m.agentId && !seen.has(m.agentId)) seen.set(m.agentId, m.agentDescription);
    }
    return Array.from(seen.entries()).map(([id, description]) => ({ id, description }));
  }, [assistantMsgs]);

  const subAgentRuns = useMemo(() =>
    subAgents.map(({ id }) => ({
      id,
      runs: mergeRuns(assistantMsgs.map((m) =>
        m.agentId === id ? dominantTool(m.toolCalls) : '',
      )).filter((r) => r.value !== ''),
    })),
    [assistantMsgs, subAgents],
  );

  const subAgentModelRuns = useMemo(() =>
    subAgents.map(({ id }) => ({
      id,
      runs: mergeRuns(assistantMsgs.map((m) => m.agentId === id ? (m.model ?? '') : '')),
    })),
    [assistantMsgs, subAgents],
  );

  const mainSkillRuns = useMemo(() => {
    let current = '';
    const values = assistantMsgs.map((m) => {
      if (!m.agentId && m.skill) current = m.skill;
      return m.agentId ? '' : current;
    });
    return mergeRuns(values).filter((r) => r.value !== '');
  }, [assistantMsgs]);

  const subAgentSkillRuns = useMemo(() =>
    subAgents.map(({ id }) => {
      let current = '';
      const values = assistantMsgs.map((m) => {
        if (m.agentId === id && m.skill) current = m.skill;
        return m.agentId === id ? current : '';
      });
      return { id, runs: mergeRuns(values).filter((r) => r.value !== '') };
    }),
    [assistantMsgs, subAgents],
  );

  const N = assistantMsgs.length;
  if (N === 0) return null;

  const LABEL_W = 60;
  const PAD_R = 60;
  const plotW = Math.max(svgWidth - LABEL_W - PAD_R, 0);
  const colW = plotW / N;

  const TOOL_LANE_H = 16;
  const SKILL_LINE_H = 8;
  const LANE_H = TOOL_LANE_H + SKILL_LINE_H;
  const LANE_GAP = 6;
  const AXIS_H = 16;

  const MODEL_LINE_H = 3;
  const toolY = 0;
  const subAgentLaneY = (i: number) => toolY + LANE_H + LANE_GAP + i * (LANE_H + LANE_GAP);
  const lastLaneBottom = subAgents.length > 0
    ? subAgentLaneY(subAgents.length - 1) + LANE_H
    : toolY + LANE_H;
  const axisY = lastLaneBottom + 4;
  const totalH = axisY + AXIS_H;

  const toX = (i: number) => LABEL_W + i * colW;

  const ticks: number[] = [];
  for (let i = 0; i < N; i++) {
    if ((i + 1) % tickStep === 0) ticks.push(i);
  }

  return (
    <Box ref={containerRef} sx={{ mt: 0.5 }}>
      <svg width="100%" height={totalH} style={{ display: 'block', overflow: 'visible' }}>
        {/* Claude Code lane (main agent only) */}
        <text x={LABEL_W - 4} y={toolY + TOOL_LANE_H / 2 + 4} textAnchor="end" fontSize={9} fill={colors.textSecondary}>Claude Code</text>
        {toolRuns.map((run) => (
          <rect key={`t${run.start}`} x={toX(run.start)} y={toolY}
            width={Math.max((run.end - run.start + 1) * colW, 1)} height={TOOL_LANE_H}
            fill={LANE_TOOL_COLORS[run.value as LaneTool]} />
        ))}
        {mainModelRuns.filter((r) => r.value).map((run) => (
          <rect key={`tm${run.start}`} x={toX(run.start)} y={toolY + TOOL_LANE_H - MODEL_LINE_H}
            width={Math.max((run.end - run.start + 1) * colW, 1)} height={MODEL_LINE_H}
            fill={laneModelColor(run.value)} />
        ))}
        {mainSkillRuns.map((run) => {
          const naturalW = (run.end - run.start + 1) * colW;
          const w = Math.max(naturalW, 5);
          const cx = toX(run.start) + naturalW / 2;
          return (
            <rect key={`ts${run.start}`} data-skill={run.value}
              x={cx - w / 2} y={toolY + TOOL_LANE_H}
              width={w} height={SKILL_LINE_H}
              fill={laneSkillColor(run.value)} />
          );
        })}
        {/* SubAgent lanes — one per unique sub-agent */}
        {subAgents.map(({ id }, i) => {
          const y = subAgentLaneY(i);
          const toolRunsForAgent = subAgentRuns[i]?.runs ?? [];
          const modelRunsForAgent = subAgentModelRuns[i]?.runs ?? [];
          const skillRunsForAgent = subAgentSkillRuns[i]?.runs ?? [];
          return (
            <g key={id}>
              <text x={LABEL_W - 4} y={y + TOOL_LANE_H / 2 + 4} textAnchor="end" fontSize={9} fill={colors.textSecondary}>
                {`SubAgent ${i + 1}`}
              </text>
              {toolRunsForAgent.map((run) => (
                <rect key={`sa${i}-${run.start}`} x={toX(run.start)} y={y}
                  width={Math.max((run.end - run.start + 1) * colW, 1)} height={TOOL_LANE_H}
                  fill={LANE_TOOL_COLORS[run.value as LaneTool]} />
              ))}
              {modelRunsForAgent.filter((r) => r.value).map((run) => (
                <rect key={`sam${i}-${run.start}`} x={toX(run.start)} y={y + TOOL_LANE_H - MODEL_LINE_H}
                  width={Math.max((run.end - run.start + 1) * colW, 1)} height={MODEL_LINE_H}
                  fill={laneModelColor(run.value)} />
              ))}
              {skillRunsForAgent.map((run) => {
                const naturalW = (run.end - run.start + 1) * colW;
                const w = Math.max(naturalW, 5);
                const cx = toX(run.start) + naturalW / 2;
                return (
                  <rect key={`sas${i}-${run.start}`}
                    x={cx - w / 2} y={y + TOOL_LANE_H}
                    width={w} height={SKILL_LINE_H}
                    fill={laneSkillColor(run.value)} />
                );
              })}
            </g>
          );
        })}
        {/* Commit/Error reference lines spanning all lanes */}
        {commitTurns?.map((turn) => {
          const x = toX(turn - 1) + colW / 2;
          return (
            <line key={`rl-commit-${turn}`} x1={x} y1={0} x2={x} y2={axisY}
              stroke="#4CAF50" strokeWidth={1.5} strokeDasharray="4 2" />
          );
        })}
        {errorTurns?.map((turn) => {
          const x = toX(turn - 1) + colW / 2;
          return (
            <line key={`rl-error-${turn}`} x1={x} y1={0} x2={x} y2={axisY}
              stroke="#F44336" strokeWidth={1.5} strokeDasharray="4 2" />
          );
        })}
        {/* X-axis */}
        <line x1={LABEL_W} y1={axisY} x2={LABEL_W + plotW} y2={axisY} stroke={colors.border} strokeWidth={0.5} />
        {ticks.map((i) => {
          const x = toX(i) + colW / 2;
          return (
            <g key={i}>
              <line x1={x} y1={axisY} x2={x} y2={axisY + 3} stroke={colors.border} strokeWidth={0.5} />
              <text x={x} y={axisY + 13} textAnchor="middle" fontSize={9} fill={colors.textSecondary}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

function TurnLaneChartLegend({
  assistantMsgs,
}: Readonly<{ assistantMsgs: readonly TrailMessage[] }>) {
  const uniqueModels = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const m of assistantMsgs) {
      const model = m.model ?? '';
      if (!seen.has(model)) { seen.add(model); result.push(model); }
    }
    return result;
  }, [assistantMsgs]);

  const uniqueSkills = useMemo(() => {
    const seen = new Set<string>();
    for (const m of assistantMsgs) { if (m.skill) seen.add(m.skill); }
    return Array.from(seen);
  }, [assistantMsgs]);

  const usedToolCats = useMemo(() => {
    const seen = new Set<LaneTool>();
    for (const m of assistantMsgs) {
      const d = dominantTool(m.toolCalls);
      if (d !== '') seen.add(d);
    }
    return LANE_TOOL_CATS.filter((c) => seen.has(c));
  }, [assistantMsgs]);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, pl: '60px', mt: 0.5 }}>
      {uniqueModels.map((model) => (
        <Box key={model} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: laneModelColor(model) }} />
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{model || 'unknown'}</Typography>
        </Box>
      ))}
      {uniqueSkills.map((skill) => (
        <Box key={skill} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 3, borderRadius: '1px', bgcolor: laneSkillColor(skill) }} />
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{skill}</Typography>
        </Box>
      ))}
      {usedToolCats.map((cat) => (
        <Box key={cat} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: LANE_TOOL_COLORS[cat] }} />
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{LANE_TOOL_LABELS[cat]}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function StackedReferenceLines({
  commitTurns,
  errorTurns,
  totalTurns,
}: Readonly<{
  commitTurns: readonly number[];
  errorTurns: readonly number[];
  totalTurns: number;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const LABEL_W = 60;
  const PAD_R = 60;
  const plotW = Math.max(width - LABEL_W - PAD_R, 0);
  const colW = totalTurns > 0 ? plotW / totalTurns : 0;
  const turnX = (turn: number) => LABEL_W + (turn - 0.5) * colW;

  return (
    <Box
      ref={ref}
      sx={{
        position: 'absolute',
        top: '16px', left: 0,
        width: '100%', height: 'calc(100% - 32px)',
        pointerEvents: 'none',
      }}
    >
      {width > 0 && totalTurns > 0 && (
        <svg width="100%" height="100%" style={{ display: 'block' }}>
          {commitTurns.map((turn) => (
            <line key={`oc-${turn}`}
              x1={turnX(turn)} y1={0}
              x2={turnX(turn)} y2="100%"
              stroke="#4CAF50" strokeWidth={1.5} strokeDasharray="4 2"
            />
          ))}
          {errorTurns.map((turn) => (
            <line key={`oe-${turn}`}
              x1={turnX(turn)} y1={0}
              x2={turnX(turn)} y2="100%"
              stroke="#F44336" strokeWidth={1.5} strokeDasharray="4 2"
            />
          ))}
        </svg>
      )}
    </Box>
  );
}

function SessionCacheTimeline({
  messages,
}: Readonly<{
  messages: readonly TrailMessage[];
}>) {
  const { colors, chartColors, cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const assistantMsgs = messages.filter((m) => m.type === 'assistant' && m.usage);
  const hasData = assistantMsgs.length > 0;
  const compactDrops = useMemo(() => countCompactDrops(assistantMsgs), [assistantMsgs]);
  const [mode, setMode] = useState<'tool' | 'skill'>('tool');

  const byUuid = useMemo(() => {
    const map = new Map<string, TrailMessage>();
    for (const m of messages) map.set(m.uuid, m);
    return map;
  }, [messages]);

  const dataset = useMemo(() => {
    let cumulativeMs = 0;
    let currentSkill = '';
    return assistantMsgs.map((m, i) => {
      const parent = m.parentUuid ? byUuid.get(m.parentUuid) : undefined;
      const apiInferenceMs = (parent?.timestamp && m.timestamp)
        ? Math.max(0, new Date(m.timestamp).getTime() - new Date(parent.timestamp).getTime())
        : 0;
      const toolExecMs = m.toolExecMs ?? 0;
      cumulativeMs += apiInferenceMs + toolExecMs;
      const inputTokens = m.usage?.inputTokens ?? 0;
      const outputTokens = m.usage?.outputTokens ?? 0;
      const hasTool = (m.toolCalls?.length ?? 0) > 0;
      if (!m.agentId && m.skill) currentSkill = m.skill;
      const skillActive = !m.agentId && currentSkill !== '';
      return {
        turn: i + 1,
        inputTokens,
        outputTokens,
        cacheReadTokens: m.usage?.cacheReadTokens ?? 0,
        cacheCreationTokens: m.usage?.cacheCreationTokens ?? 0,
        toolUsageTokens: hasTool ? inputTokens + outputTokens : 0,
        skillUsageTokens: skillActive ? inputTokens + outputTokens : 0,
        skillExecMs: skillActive ? apiInferenceMs + toolExecMs : 0,
        cumulativeMs,
        apiInferenceMs,
        toolExecMs,
      };
    });
  }, [assistantMsgs, byUuid]);

  const agentIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const m of assistantMsgs) {
      if (m.agentId && !map.has(m.agentId)) map.set(m.agentId, ++idx);
    }
    return map;
  }, [assistantMsgs]);

  const commitMarkers = useMemo<readonly CommitMarkerData[]>(() =>
    assistantMsgs.flatMap((m, i) => {
      if (!((m.triggerCommitHashes && m.triggerCommitHashes.length > 0) || m.hasCommit)) return [];
      const agentLabel = m.agentId ? `SubAgent ${agentIndexMap.get(m.agentId) ?? '?'}` : 'Claude Code';
      const commitHash = m.triggerCommitHashes?.[0]?.slice(0, 8) ?? '';
      const bashCmd = m.toolCalls?.find((tc) => tc.name === 'Bash')?.input?.command;
      const subject = typeof bashCmd === 'string' ? parseCommitSubject(bashCmd) : '';
      const commitPrefix = extractPrefixWithScope(subject);
      return [{ turn: i + 1, agentLabel, commitHash, commitPrefix }];
    }),
    [assistantMsgs, agentIndexMap],
  );

  const errorMarkers = useMemo<readonly ErrorMarkerData[]>(() =>
    assistantMsgs.flatMap((m, i) => {
      if (!m.hasToolError) return [];
      const agentLabel = m.agentId ? `SubAgent ${agentIndexMap.get(m.agentId) ?? '?'}` : 'Claude Code';
      const toolName = dominantTool(m.toolCalls) || m.toolCalls?.[0]?.name || '';
      return [{ turn: i + 1, agentLabel, toolName }];
    }),
    [assistantMsgs, agentIndexMap],
  );

  const commitTurns = useMemo(() => commitMarkers.map((m) => m.turn), [commitMarkers]);
  const errorTurns = useMemo(() => errorMarkers.map((m) => m.turn), [errorMarkers]);

  const totalTurns = dataset.length;
  const tickStep = totalTurns <= 5 ? 1
    : totalTurns <= 10 ? 2
    : totalTurns <= 25 ? 5
    : totalTurns <= 50 ? 10
    : totalTurns <= 100 ? 20
    : totalTurns <= 250 ? 50
    : totalTurns <= 500 ? 100
    : totalTurns <= 1000 ? 200
    : 500;

  return (
    <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5 }}>
      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2">
          {t('analytics.sessionCacheTimelineTitle')} {hasData && `(${assistantMsgs.length} ${t('analytics.turns')})`}
        </Typography>
        {compactDrops >= 2 && (
          <Tooltip title={t('analytics.compactLoopTooltip')}>
            <Chip
              label={`⚠ Compact ×${compactDrops}`}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, v: 'tool' | 'skill' | null) => { if (v) setMode(v); }}
          sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: '0.7rem' } }}
        >
          <ToggleButton value="tool">{t('analytics.modeTool')}</ToggleButton>
          <ToggleButton value="skill">{t('analytics.modeSkill')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {hasData ? (
        <>
        <Box sx={{ position: 'relative' }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <ChartsDataProvider
            dataset={dataset as any}
            series={[
              mode === 'tool'
                ? { type: 'bar' as const, dataKey: 'toolUsageTokens', label: t('analytics.chartToolUsageTokens'), color: chartColors.toolExec, yAxisId: 'toolTokens', valueFormatter: (v: number | null) => (v == null ? '' : fmtTokens(v)) }
                : { type: 'bar' as const, dataKey: 'skillUsageTokens', label: t('analytics.chartSkillUsageTokens'), color: chartColors.skill, yAxisId: 'toolTokens', valueFormatter: (v: number | null) => (v == null ? '' : fmtTokens(v)) },
              { type: 'line', dataKey: 'inputTokens', label: t('analytics.chartInput'), color: chartColors.input, showMark: false, yAxisId: 'tokens' },
              { type: 'line', dataKey: 'outputTokens', label: t('analytics.chartOutput'), color: chartColors.output, showMark: false, yAxisId: 'tokens' },
              { type: 'line', dataKey: 'cacheReadTokens', label: t('analytics.chartCacheRead'), color: chartColors.cacheRead, showMark: false, yAxisId: 'tokens' },
              { type: 'line', dataKey: 'cacheCreationTokens', label: t('analytics.chartCacheWrite'), color: chartColors.cacheWrite, showMark: false, yAxisId: 'tokens' },
            ]}
            xAxis={[{ id: 'x', dataKey: 'turn', scaleType: 'band', tickInterval: (value: number) => value % tickStep === 0 }]}
            yAxis={[
              { id: 'tokens', valueFormatter: fmtTokens, width: 50 },
              { id: 'toolTokens', position: 'right', valueFormatter: fmtTokens, width: 50 },
            ]}
            height={200}
            margin={{ left: 10, right: 10, top: 16, bottom: 0 }}
          >
            <ChartsWrapper>
              <ChartsSurface>
                <ChartsGrid horizontal />
                <BarPlot />
                <LinePlot />
                <ChartsAxisHighlight x="band" />
                <ChartsYAxis axisId="tokens" />
                <ChartsYAxis axisId="toolTokens" />
                <CommitMarkers markers={commitMarkers} />
                <ErrorMarkers markers={errorMarkers} />
              </ChartsSurface>
              <ChartsTooltip />
            </ChartsWrapper>
          </ChartsDataProvider>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <ChartsDataProvider
            dataset={dataset as any}
            series={mode === 'tool' ? [
              { type: 'bar' as const, dataKey: 'apiInferenceMs', label: t('analytics.chartApiInferenceTime'), color: chartColors.apiInference, stack: 'timing', yAxisId: 'perTurn', valueFormatter: (v: number | null) => (v == null ? '' : fmtDurationShort(v)) },
              { type: 'bar' as const, dataKey: 'toolExecMs', label: t('analytics.chartToolExecTime'), color: chartColors.toolExec, stack: 'timing', yAxisId: 'perTurn', valueFormatter: (v: number | null) => (v == null ? '' : fmtDurationShort(v)) },
              { type: 'line' as const, dataKey: 'cumulativeMs', label: t('analytics.chartCumulativeInferenceTime'), color: chartColors.cumulativeTime, showMark: false, yAxisId: 'cumTime', valueFormatter: (v: number | null) => (v == null ? '' : fmtDurationShort(v)) },
            ] : [
              { type: 'bar' as const, dataKey: 'skillExecMs', label: t('analytics.chartSkillExecTime'), color: chartColors.skill, yAxisId: 'perTurn', valueFormatter: (v: number | null) => (v == null ? '' : fmtDurationShort(v)) },
              { type: 'line' as const, dataKey: 'cumulativeMs', label: t('analytics.chartCumulativeInferenceTime'), color: chartColors.cumulativeTime, showMark: false, yAxisId: 'cumTime', valueFormatter: (v: number | null) => (v == null ? '' : fmtDurationShort(v)) },
            ]}
            xAxis={[{ id: 'x', dataKey: 'turn', scaleType: 'band', tickInterval: (value: number) => value % tickStep === 0 }]}
            yAxis={[
              { id: 'perTurn', valueFormatter: fmtDurationShort, width: 50 },
              { id: 'cumTime', position: 'right', valueFormatter: fmtDurationShort, width: 50 },
            ]}
            height={140}
            margin={{ left: 10, right: 10, top: 0, bottom: 0 }}
          >
            <ChartsWrapper>
              <ChartsSurface>
                <ChartsGrid horizontal />
                <BarPlot />
                <LinePlot />
                <ChartsAxisHighlight x="band" />
                <ChartsYAxis axisId="perTurn" />
                <ChartsYAxis axisId="cumTime" />
              </ChartsSurface>
              <ChartsTooltip />
            </ChartsWrapper>
          </ChartsDataProvider>
          <TurnLaneChart
            assistantMsgs={assistantMsgs}
            tickStep={tickStep}
          />
          <StackedReferenceLines
            commitTurns={commitTurns}
            errorTurns={errorTurns}
            totalTurns={totalTurns}
          />
        </Box>
        <TurnLaneChartLegend assistantMsgs={assistantMsgs} />
        </>
      ) : (
        <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${colors.border}`, borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            {t('analytics.noTokenData')}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

function SessionCommitPrefixChart({
  sessionId,
  fetchSessionCommits,
}: Readonly<{
  sessionId: string;
  fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
}>) {
  const { colors, cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const [commits, setCommits] = useState<readonly TrailSessionCommit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetchSessionCommits(sessionId);
        if (!cancelled) setCommits(result);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, fetchSessionCommits]);

  if (loading) return null;

  if (commits.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ px: 1.5 }}>{t('analytics.commitPrefixChartTitle')}</Typography>
        <Box sx={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h5" sx={{ color: colors.textSecondary }}>0</Typography>
        </Box>
      </Paper>
    );
  }

  const prefixCounts = new Map<string, number>();
  for (const c of commits) {
    const subject = (c.commitMessage ?? '').split('\n')[0];
    const prefix = extractCommitPrefix(subject);
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }
  const sorted = [...prefixCounts.entries()].sort(([, a], [, b]) => b - a);
  const pieData = sorted.map(([prefix, count], i) => ({
    id: i,
    value: count,
    label: `${prefix} (${count})`,
    color: toolPalette[i % toolPalette.length],
  }));

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ px: 1.5 }}>
        {t('analytics.commitPrefixChartTitle')}
      </Typography>
      <PieChart
        series={[{ data: pieData, innerRadius: 28, outerRadius: 52, paddingAngle: 2, cornerRadius: 3 }]}
        height={130}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        slots={{ legend: () => null }}
      >
        <PieCenterLabel value={commits.length} color={colors.textPrimary} />
      </PieChart>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1.5, pb: 0.5 }}>
        {sorted.map(([prefix, count], i) => (
          <Chip
            key={prefix}
            size="small"
            label={`${prefix} (${count})`}
            sx={{ bgcolor: toolPalette[i % toolPalette.length], color: '#fff', fontSize: '0.65rem', height: 18 }}
          />
        ))}
      </Box>
    </Paper>
  );
}

function SessionCommitList({
  sessionId,
  usage,
  fetchSessionCommits,
}: Readonly<{
  sessionId: string;
  usage: TrailTokenUsage;
  fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
}>) {
  const { colors, cardSx, scrollbarSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [commits, setCommits] = useState<readonly TrailSessionCommit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchSessionCommits(sessionId);
        if (!cancelled) setCommits(result);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, fetchSessionCommits]);

  const totalAdded = commits.reduce((sum, c) => sum + c.linesAdded, 0);
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const tokensPerLine = totalAdded > 0 ? Math.round(totalTokens / totalAdded) : 0;

  if (loading) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5 }}>
        <Typography variant="body2" color="text.secondary">{t('analytics.loadingCommits')}</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5 }}>
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2">
          {t('analytics.relatedCommits')} ({commits.length})
        </Typography>
      </Box>
      {commits.length === 0 ? (
        <Box sx={{ height: 198, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${colors.border}`, borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            {t('analytics.noCommits')}
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ height: 198, overflowY: 'auto', ...scrollbarSx }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { color: colors.textSecondary, borderColor: colors.border, bgcolor: colors.midnightNavy } }}>
                  <TableCell>{t('analytics.commitHash')}</TableCell>
                  <TableCell>{t('analytics.commitMessage')}</TableCell>
                  <TableCell align="right">{t('analytics.commitFiles')}</TableCell>
                  <TableCell align="right">{t('analytics.commitDiff')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {commits.map((c) => (
                  <TableRow key={c.commitHash} sx={{ '& .MuiTableCell-root': { borderColor: colors.border } }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {c.commitHash.slice(0, 8)}
                      {c.isAiAssisted && (
                        <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'info.main' }}>
                          {t('analytics.commitAI')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.commitMessage}
                    </TableCell>
                    <TableCell align="right">{c.filesChanged}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      +{fmtNum(c.linesAdded)} / -{fmtNum(c.linesDeleted)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {totalAdded > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {t('analytics.tokensPerLineLabel')} {fmtTokens(tokensPerLine)}
            </Typography>
          )}
        </>
      )}
    </Paper>
  );
}

function SessionMetricsPanel({ session, toolMetrics }: Readonly<{
  session: TrailSession;
  toolMetrics?: ToolMetrics | null;
}>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [usageIdx, setUsageIdx] = useState(0);
  const [productivityIdx, setProductivityIdx] = useState(0);
  const [qualityIdx, setQualityIdx] = useState(0);

  const s = session;
  const totalTokens = s.usage.inputTokens + s.usage.outputTokens;
  const cost = sessionCost(s);
  const durationMs = new Date(s.endTime).getTime() - new Date(s.startTime).getTime();
  const durationHours = durationMs / 3_600_000;
  const cacheInput = s.usage.inputTokens + s.usage.cacheReadTokens;
  const cacheHitRate = cacheInput > 0 ? s.usage.cacheReadTokens / cacheInput : 0;
  const outputRatio = cacheInput > 0 ? s.usage.outputTokens / cacheInput : 0;
  const contextGrowth = s.messageCount > 0
    ? ((s.peakContextTokens ?? 0) - (s.initialContextTokens ?? 0)) / s.messageCount
    : 0;
  const linesAdded = s.commitStats?.linesAdded ?? 0;
  const linesDeleted = s.commitStats?.linesDeleted ?? 0;
  const tm = toolMetrics;

  const cardStyle = { ...cardSx, p: 2, minWidth: 160, flex: '1 1 160px', textAlign: 'center' } as const;

  const usageCards = [
    { label: t('analytics.totalTokens'), value: fmtTokens(totalTokens) },
    { label: t('analytics.estimatedCost'), value: fmtUsd(cost) },
    { label: t('analytics.metricMessages'), value: fmtNum(s.messageCount) },
    { label: t('analytics.metricErrors'), value: (s.errorCount ?? 0) > 0 ? fmtNum(s.errorCount!) : '\u2014' },
    { label: t('analytics.cacheHit'), value: cacheInput > 0 ? fmtPercent(cacheHitRate) : '\u2014' },
    { label: t('analytics.outputRatio'), value: cacheInput > 0 ? fmtPercent(outputRatio) : '\u2014' },
    { label: t('analytics.contextGrowth'), value: s.messageCount > 0 ? `${fmtTokens(Math.round(contextGrowth))}/step` : '\u2014' },
    { label: t('analytics.netLines'), value: linesAdded > 0 || linesDeleted > 0 ? `+${fmtNum(linesAdded)} / -${fmtNum(linesDeleted)}` : '\u2014' },
    { label: t('analytics.metricFiles'), value: (s.commitStats?.filesChanged ?? 0) > 0 ? fmtNum(s.commitStats!.filesChanged) : '\u2014' },
    { label: t('analytics.metricDuration'), value: durationMs > 0 ? fmtDuration(durationMs) : '\u2014' },
  ];

  const productivityCards = [
    { label: t('analytics.tokensPerStep'), value: s.messageCount > 0 ? fmtTokens(Math.round(totalTokens / s.messageCount)) : '\u2014' },
    { label: t('analytics.costPerStep'), value: s.messageCount > 0 ? fmtUsd(cost / s.messageCount) : '\u2014' },
    { label: t('analytics.linesPerHour'), value: durationHours > 0 && linesAdded > 0 ? fmtNum(Math.round(linesAdded / durationHours)) : '\u2014' },
    { label: t('analytics.costPerHour'), value: durationHours > 0 ? fmtUsd(cost / durationHours) : '\u2014' },
    { label: t('analytics.costPerCommit'), value: (s.commitStats?.commits ?? 0) > 0 ? fmtUsd(cost / s.commitStats!.commits) : '\u2014' },
    { label: t('analytics.avgInterval'), value: s.messageCount > 1 ? fmtDuration(durationMs / (s.messageCount - 1)) : '\u2014' },
  ];

  const qualityCards = [
    { label: t('analytics.retryRate'), value: tm && tm.totalEdits > 0 ? fmtPercent(tm.totalRetries / tm.totalEdits) : '\u2014' },
    { label: t('analytics.buildFail'), value: tm && tm.totalBuildRuns > 0 ? fmtPercent(tm.totalBuildFails / tm.totalBuildRuns) : '\u2014' },
    { label: t('analytics.testFail'), value: tm && tm.totalTestRuns > 0 ? fmtPercent(tm.totalTestFails / tm.totalTestRuns) : '\u2014' },
    { label: t('analytics.metricInterrupted'), value: s.interruption?.interrupted
        ? `${s.interruption.reason === 'max_tokens' ? 'max_tokens' : 'no response'} (${fmtTokens(s.interruption.contextTokens)})`
        : '\u2014' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 1 }}>
      <CyclingCard
        groupName={t('analytics.groupUsage')}
        items={usageCards}
        index={usageIdx}
        onCycle={() => setUsageIdx((i) => (i + 1) % usageCards.length)}
        cardStyle={cardStyle}
      />
      <CyclingCard
        groupName={t('analytics.groupProductivity')}
        items={productivityCards}
        index={productivityIdx}
        onCycle={() => setProductivityIdx((i) => (i + 1) % productivityCards.length)}
        cardStyle={cardStyle}
      />
      <CyclingCard
        groupName={t('analytics.groupQuality')}
        items={qualityCards}
        index={qualityIdx}
        onCycle={() => setQualityIdx((i) => (i + 1) % qualityCards.length)}
        cardStyle={cardStyle}
      />
    </Box>
  );
}

type SessionToolMetric = 'count' | 'tokens' | 'duration';

function SessionToolUsageChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { colors, cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const usage = toolMetrics?.toolUsage;
  if (!usage || usage.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ px: 1.5 }}>{t('analytics.toolUsageTitle')}</Typography>
        <Box sx={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h5" sx={{ color: colors.textSecondary }}>0</Typography>
        </Box>
      </Paper>
    );
  }

  const sorted = [...usage].sort((a, b) => b.count - a.count);
  const pieData = sorted.map((e, i) => ({
    id: i,
    value: e.count,
    label: `${e.tool} (${e.count})`,
    color: toolPalette[i % toolPalette.length],
  }));

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ px: 1.5 }}>{t('analytics.toolUsageTitle')}</Typography>
      <PieChart
        series={[{ data: pieData, innerRadius: 28, outerRadius: 52, paddingAngle: 2, cornerRadius: 3 }]}
        height={130}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        slots={{ legend: () => null }}
      >
        <PieCenterLabel value={sorted.reduce((s, e) => s + e.count, 0)} color={colors.textPrimary} />
      </PieChart>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1.5, pb: 0.5 }}>
        {sorted.map((e, i) => (
          <Chip
            key={e.tool}
            size="small"
            label={`${e.tool} (${e.count})`}
            sx={{ bgcolor: toolPalette[i % toolPalette.length], color: '#fff', fontSize: '0.65rem', height: 18 }}
          />
        ))}
      </Box>
    </Paper>
  );
}

function SessionSkillUsageChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { colors, cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const usage = toolMetrics?.skillUsage;
  if (!usage || usage.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ px: 1.5 }}>{t('analytics.combined.skill')}</Typography>
        <Box sx={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h5" sx={{ color: colors.textSecondary }}>0</Typography>
        </Box>
      </Paper>
    );
  }

  const sorted = [...usage].sort((a, b) => b.count - a.count);
  const pieData = sorted.map((e, i) => ({
    id: i,
    value: e.count,
    label: `${e.skill} (${e.count})`,
    color: toolPalette[i % toolPalette.length],
  }));

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ px: 1.5 }}>{t('analytics.combined.skill')}</Typography>
      <PieChart
        series={[{ data: pieData, innerRadius: 28, outerRadius: 52, paddingAngle: 2, cornerRadius: 3 }]}
        height={130}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        slots={{ legend: () => null }}
      >
        <PieCenterLabel value={sorted.reduce((s, e) => s + e.count, 0)} color={colors.textPrimary} />
      </PieChart>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1.5, pb: 0.5 }}>
        {sorted.map((e, i) => (
          <Chip
            key={e.skill}
            size="small"
            label={`${e.skill} (${e.count})`}
            sx={{ bgcolor: toolPalette[i % toolPalette.length], color: '#fff', fontSize: '0.65rem', height: 18 }}
          />
        ))}
      </Box>
    </Paper>
  );
}

function SessionErrorChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { colors, cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const errors = toolMetrics?.errorsByTool;
  if (!errors || errors.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ px: 1.5 }}>{t('analytics.combined.error')}</Typography>
        <Box sx={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h5" sx={{ color: colors.textSecondary }}>0</Typography>
        </Box>
      </Paper>
    );
  }

  const sorted = [...errors].sort((a, b) => b.count - a.count);
  const pieData = sorted.map((e, i) => ({
    id: i,
    value: e.count,
    label: `${e.tool} (${e.count})`,
    color: toolPalette[i % toolPalette.length],
  }));

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 1.5, pb: 1, flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ px: 1.5 }}>{t('analytics.combined.error')}</Typography>
      <PieChart
        series={[{ data: pieData, innerRadius: 28, outerRadius: 52, paddingAngle: 2, cornerRadius: 3 }]}
        height={130}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        slots={{ legend: () => null }}
      >
        <PieCenterLabel value={sorted.reduce((s, e) => s + e.count, 0)} color={colors.textPrimary} />
      </PieChart>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1.5, pb: 0.5 }}>
        {sorted.map((e, i) => (
          <Chip
            key={e.tool}
            size="small"
            label={`${e.tool} (${e.count})`}
            sx={{ bgcolor: toolPalette[i % toolPalette.length], color: '#fff', fontSize: '0.65rem', height: 18 }}
          />
        ))}
      </Box>
    </Paper>
  );
}

function mergeToolMetrics(metrics: readonly (ToolMetrics | null)[]): ToolMetrics | null {
  const valid = metrics.filter((m): m is ToolMetrics => m !== null);
  if (valid.length === 0) return null;

  function mergeUsage<T extends { count: number; tokens: number; durationMs: number }>(
    arrays: readonly (readonly T[] | undefined)[],
    getKey: (e: T) => string,
    makeEntry: (key: string, acc: { count: number; tokens: number; durationMs: number }) => T,
  ): T[] {
    const map = new Map<string, { count: number; tokens: number; durationMs: number }>();
    for (const arr of arrays) {
      for (const e of arr ?? []) {
        const k = getKey(e);
        const acc = map.get(k) ?? { count: 0, tokens: 0, durationMs: 0 };
        acc.count += e.count;
        acc.tokens += e.tokens;
        acc.durationMs += e.durationMs;
        map.set(k, acc);
      }
    }
    return [...map.entries()].map(([k, acc]) => makeEntry(k, acc));
  }

  const errMap = new Map<string, number>();
  for (const m of valid) {
    for (const e of m.errorsByTool ?? []) {
      errMap.set(e.tool, (errMap.get(e.tool) ?? 0) + e.count);
    }
  }

  return {
    totalRetries: valid.reduce((s, m) => s + m.totalRetries, 0),
    totalEdits: valid.reduce((s, m) => s + m.totalEdits, 0),
    totalBuildRuns: valid.reduce((s, m) => s + m.totalBuildRuns, 0),
    totalBuildFails: valid.reduce((s, m) => s + m.totalBuildFails, 0),
    totalTestRuns: valid.reduce((s, m) => s + m.totalTestRuns, 0),
    totalTestFails: valid.reduce((s, m) => s + m.totalTestFails, 0),
    toolUsage: mergeUsage(valid.map((m) => m.toolUsage), (e) => e.tool, (tool, acc) => ({ tool, ...acc })),
    skillUsage: mergeUsage(valid.map((m) => m.skillUsage), (e) => e.skill, (skill, acc) => ({ skill, ...acc })),
    errorsByTool: [...errMap.entries()].map(([tool, count]) => ({ tool, count })),
    modelUsage: mergeUsage(valid.map((m) => m.modelUsage), (e) => e.model, (model, acc) => ({ model, ...acc })),
  };
}

function buildDaySession(date: string, daySessions: readonly TrailSession[]): TrailSession {
  if (daySessions.length === 0) {
    return {
      id: `day-${date}`, slug: date, project: '', gitBranch: '',
      startTime: `${date}T00:00:00.000Z`, endTime: `${date}T23:59:59.999Z`,
      version: '', model: '', messageCount: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    };
  }
  const sorted = [...daySessions].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const usage = daySessions.reduce<TrailTokenUsage>((acc, s) => ({
    inputTokens: acc.inputTokens + s.usage.inputTokens,
    outputTokens: acc.outputTokens + s.usage.outputTokens,
    cacheReadTokens: acc.cacheReadTokens + s.usage.cacheReadTokens,
    cacheCreationTokens: acc.cacheCreationTokens + s.usage.cacheCreationTokens,
  }), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
  const commitStats = daySessions.reduce<{ commits: number; linesAdded: number; linesDeleted: number; filesChanged: number } | undefined>((acc, s) => {
    if (!s.commitStats) return acc;
    const base = acc ?? { commits: 0, linesAdded: 0, linesDeleted: 0, filesChanged: 0 };
    return {
      commits: base.commits + s.commitStats.commits,
      linesAdded: base.linesAdded + s.commitStats.linesAdded,
      linesDeleted: base.linesDeleted + s.commitStats.linesDeleted,
      filesChanged: base.filesChanged + s.commitStats.filesChanged,
    };
  }, undefined);
  const peakContextTokens = daySessions.reduce((max, s) => Math.max(max, s.peakContextTokens ?? 0), 0);
  return {
    id: `day-${date}`, slug: date, project: sorted[0].project, gitBranch: '',
    startTime: sorted[0].startTime, endTime: sorted.at(-1)!.endTime,
    version: '', model: '',
    messageCount: daySessions.reduce((acc, s) => acc + s.messageCount, 0),
    peakContextTokens: peakContextTokens > 0 ? peakContextTokens : undefined,
    usage,
    commitStats,
    estimatedCostUsd: daySessions.reduce((acc, s) => acc + (s.estimatedCostUsd ?? 0), 0),
  };
}

function DailySessionList({
  date,
  sessions,
  sessionsLoading,
  onSelectSession,
  onJumpToTrace,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
  fetchDayToolMetrics,
}: Readonly<{
  date: string;
  sessions: readonly TrailSession[];
  sessionsLoading?: boolean;
  onSelectSession?: (id: string) => void;
  onJumpToTrace?: (session: TrailSession) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  fetchDayToolMetrics?: (date: string) => Promise<ToolMetrics | null>;
}>) {
  const { colors, cardSx, scrollbarSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [timelineSessionId, setTimelineSessionId] = useState<string | null>(null);
  const [timelineMessages, setTimelineMessages] = useState<readonly TrailMessage[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [sessionToolMetrics, setSessionToolMetrics] = useState<ToolMetrics | null>(null);
  const [dayAggToolMetrics, setDayAggToolMetrics] = useState<ToolMetrics | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState(false);

  const handleCopySessionId = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(id).then(() => {
        setCopiedSessionId(true);
        setTimeout(() => setCopiedSessionId(false), 2000);
      });
    },
    [],
  );
  const daySessions = sessions.filter((s) => toLocalDateKey(s.startTime) === date);
  const sessionCountLabel = daySessions.length !== 1
    ? t('sessionList.sessions')
    : t('sessionList.session');
  const headerLabel = sessionsLoading
    ? '...'
    : `${daySessions.length} ${sessionCountLabel}`;

  useEffect(() => {
    if (!fetchDayToolMetrics) {
      setDayAggToolMetrics(null);
      return;
    }
    let cancelled = false;
    void fetchDayToolMetrics(date).then((result) => {
      if (!cancelled) setDayAggToolMetrics(result);
    });
    return () => { cancelled = true; };
  }, [date, fetchDayToolMetrics]);

  const handleSessionClick = (id: string) => {
    if (timelineSessionId === id) {
      setTimelineSessionId(null);
      setTimelineMessages([]);
      setSessionToolMetrics(null);
      return;
    }
    if (fetchSessionMessages) {
      setTimelineSessionId(id);
      setTimelineLoading(true);
      setSessionToolMetrics(null);
      void fetchSessionMessages(id).then((msgs) => {
        setTimelineMessages(msgs);
        setTimelineLoading(false);
      });
      if (fetchSessionToolMetrics) {
        void fetchSessionToolMetrics(id).then(setSessionToolMetrics);
      }
    } else {
      onSelectSession?.(id);
    }
  };

  return (
    <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5 }}>
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2">
          {date} — {headerLabel}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', lg: 'row' } }}>
        {/* Left: fixed height matches right column when session selected */}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', ...scrollbarSx, ...((daySessions.length > 0 || sessionsLoading) ? { height: { lg: 726 } } : { maxHeight: { lg: 726 } }) }}>
          {sessionsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : daySessions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('sessionList.noSessionsFound')}</Typography>
          ) : (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { color: colors.textSecondary, borderColor: colors.border, bgcolor: colors.midnightNavy } }}>
                  <TableCell>{t('sessionList.timeHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.tokensHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.costHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.messagesHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.errorsHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.subAgents')}</TableCell>
                  <TableCell align="right">{t('sessionList.commitsHeader')}</TableCell>
                  <TableCell align="right" sx={{ width: 36 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {daySessions.map((s) => (
                  <TableRow
                    key={s.id}
                    hover
                    selected={timelineSessionId === s.id}
                    sx={{ cursor: 'pointer', '& .MuiTableCell-root': { borderColor: colors.border } }}
                    onClick={() => handleSessionClick(s.id)}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {formatLocalTime(s.startTime)}–{formatLocalTime(s.endTime)}
                      {s.interruption?.interrupted && (
                        <Tooltip title={
                          s.interruption.reason === 'max_tokens'
                            ? `${t('sessionList.interruptedMaxTokens')} (${t('sessionList.contextLabel')} ${fmtTokens(s.interruption.contextTokens)})`
                            : `${t('sessionList.interruptedNoResponse')} (${t('sessionList.contextLabel')} ${fmtTokens(s.interruption.contextTokens)})`
                        }>
                          <Chip
                            label={s.interruption.reason === 'max_tokens' ? t('sessionList.maxChip') : t('sessionList.nrChip')}
                            aria-label={s.interruption.reason === 'max_tokens' ? t('sessionList.interruptedMaxTokens') : t('sessionList.interruptedNoResponse')}
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ ml: 0.5, height: 18, fontSize: '0.65rem' }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {fmtTokens(s.usage.inputTokens + s.usage.outputTokens + s.usage.cacheReadTokens + s.usage.cacheCreationTokens)}
                      {s.compactCount != null && s.compactCount >= 2 && (
                        <Tooltip title={t('analytics.compactLoopTooltip')}>
                          <Chip
                            label={`⚠ ×${s.compactCount}`}
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ ml: 0.5, height: 16, fontSize: '0.65rem' }}
                          />
                        </Tooltip>
                      )}
                      {(s.initialContextTokens != null || s.peakContextTokens != null) && (
                        <Typography
                          component="div"
                          sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: colors.textSecondary, lineHeight: 1.2 }}
                        >
                          {fmtTokens(s.initialContextTokens ?? 0)}→{fmtTokens(s.peakContextTokens ?? 0)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {fmtUsd(sessionCost(s))}
                    </TableCell>
                    <TableCell align="right">{fmtNum(s.messageCount)}</TableCell>
                    <TableCell align="right">
                      {s.errorCount != null && s.errorCount > 0 ? fmtNum(s.errorCount) : '\u2014'}
                    </TableCell>
                    <TableCell align="right">
                      {s.subAgentCount != null && s.subAgentCount > 0 ? fmtNum(s.subAgentCount) : '\u2014'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {s.commitStats
                        ? `${s.commitStats.commits} (+${fmtNum(s.commitStats.linesAdded)}/-${fmtNum(s.commitStats.linesDeleted)})`
                        : '\u2014'}
                    </TableCell>
                    <TableCell align="right" sx={{ p: 0.5 }}>
                      {onJumpToTrace && (
                        <Tooltip title={t('analytics.openInTraces')}>
                          <IconButton
                            size="small"
                            aria-label={t('analytics.openInTraces')}
                            onClick={(e) => {
                              e.stopPropagation();
                              onJumpToTrace(s);
                            }}
                            sx={{ color: colors.textSecondary, '&:hover': { color: colors.iceBlue } }}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>

        {/* Right: cards + timeline — day aggregate by default, session detail when selected */}
        {daySessions.length > 0 && (() => {
          const selectedSession = timelineSessionId ? daySessions.find((s) => s.id === timelineSessionId) : undefined;
          if (selectedSession) {
            return (
              <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1, width: { lg: 600 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {selectedSession.slug ?? selectedSession.id.slice(0, 8)}
                    </Typography>
                    {selectedSession.slug && (
                      <Typography variant="caption" sx={{ color: colors.textSecondary, fontFamily: 'monospace', display: 'block' }}>
                        {selectedSession.id}
                      </Typography>
                    )}
                  </Box>
                  <Tooltip title={copiedSessionId ? t('sessionList.copied') : t('sessionList.copyId')}>
                    <IconButton
                      size="small"
                      onClick={handleCopySessionId(selectedSession.id)}
                      sx={{ p: 0.5, color: colors.textSecondary, '&:hover': { color: colors.iceBlue } }}
                      aria-label={t('sessionList.copyId')}
                    >
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <SessionMetricsPanel session={selectedSession} toolMetrics={sessionToolMetrics} />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <SessionErrorChart toolMetrics={sessionToolMetrics} />
                  {fetchSessionCommits && (
                    <SessionCommitPrefixChart
                      sessionId={timelineSessionId!}
                      fetchSessionCommits={fetchSessionCommits}
                    />
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <SessionSkillUsageChart toolMetrics={sessionToolMetrics} />
                  <SessionToolUsageChart toolMetrics={sessionToolMetrics} />
                </Box>
              </Box>
            );
          }
          return (
            <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1, width: { lg: 600 } }}>
              <SessionMetricsPanel session={buildDaySession(date, daySessions)} toolMetrics={dayAggToolMetrics} />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <SessionSkillUsageChart toolMetrics={dayAggToolMetrics} />
                <SessionToolUsageChart toolMetrics={dayAggToolMetrics} />
              </Box>
              <SessionErrorChart toolMetrics={dayAggToolMetrics} />
            </Box>
          );
        })()}
      </Box>
      {timelineSessionId && (
        timelineLoading ? (
          <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5, height: 270, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">{t('sessionList.loadingTimeline')}</Typography>
          </Paper>
        ) : (
          <SessionCacheTimeline messages={timelineMessages} />
        )
      )}
    </Paper>
  );
}

type ChartEntry = {
  date: string; fullDate: string;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
  actualCost: number; skillCost: number;
  overlayValue: number | null;
};

function toFridayWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const daysSinceFri = (dow + 2) % 7; // Fri→0, Sat→1, Sun→2, Mon→3, Tue→4, Wed→5, Thu→6
  const friday = new Date(d);
  friday.setDate(d.getDate() - daysSinceFri);
  const y = friday.getFullYear();
  const m = String(friday.getMonth() + 1).padStart(2, '0');
  const day = String(friday.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function groupByWeek(entries: readonly ChartEntry[]): ChartEntry[] {
  const map = new Map<string, ChartEntry & { _overlayCount: number }>();
  for (const d of entries) {
    const key = toFridayWeekKey(d.fullDate);
    const e = map.get(key) ?? { date: key.slice(5), fullDate: key, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, actualCost: 0, skillCost: 0, overlayValue: null, _overlayCount: 0 };
    e.inputTokens += d.inputTokens;
    e.outputTokens += d.outputTokens;
    e.cacheReadTokens += d.cacheReadTokens;
    e.cacheCreationTokens += d.cacheCreationTokens;
    e.actualCost += d.actualCost;
    e.skillCost += d.skillCost;
    if (d.overlayValue != null) {
      e.overlayValue = (e.overlayValue ?? 0) + d.overlayValue;
      e._overlayCount += 1;
    }
    map.set(key, e);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => {
    const { _overlayCount, overlayValue, ...rest } = v;
    return { ...rest, overlayValue: _overlayCount > 0 && overlayValue != null ? overlayValue / _overlayCount : null };
  });
}

function DailyActivityChart({
  items,
  period,
  mode,
  onDateClick,
  costOptimization,
  overlay,
}: Readonly<{
  items: AnalyticsData['dailyActivity'];
  period: PeriodDays;
  mode: DailyViewMode;
  onDateClick?: (fullDate: string) => void;
  costOptimization?: CostOptimizationData | null;
  overlay?: {
    bucket: 'day' | 'week';
    tokens: ReadonlyArray<{ bucketStart: string; value: number }>;
    cost: ReadonlyArray<{ bucketStart: string; value: number }>;
  } | null;
}>) {
  const { chartColors, cardSx } = useTrailTheme();
  const { t } = useTrailI18n();

  const costByDate = useMemo(() => {
    const map = new Map<string, { actual: number; skill: number }>();
    if (!costOptimization) return map;
    for (const d of costOptimization.daily) {
      map.set(d.date, { actual: d.actualCost, skill: d.skillCost });
    }
    return map;
  }, [costOptimization]);

  const overlayByDate = useMemo(() => {
    if (!overlay) return new Map<string, number>();
    const series = mode === 'tokens' ? overlay.tokens : overlay.cost;
    const map = new Map<string, number>();
    for (const b of series) {
      const localDate = toLocalDateKey(b.bucketStart);
      // trail-core buildRatioTimeSeries uses Sunday-anchored weeks; align to Friday
      const key = overlay.bucket === 'week' ? toFridayWeekKey(localDate) : localDate;
      map.set(key, b.value);
    }
    return map;
  }, [overlay, mode]);

  const overlayBucket = overlay?.bucket;
  const dataset = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    const cutoffStr = toLocalDateKey(cutoff.toISOString());
    const filtered = items.filter((d) => d.date >= cutoffStr);
    const isTokens = mode === 'tokens';
    const dailyDataset: ChartEntry[] = filtered.map((d) => {
      const costEntry = costByDate.get(d.date);
      return {
        date: d.date.slice(5),
        fullDate: d.date,
        inputTokens: isTokens ? d.inputTokens : 0,
        outputTokens: isTokens ? d.outputTokens : 0,
        cacheReadTokens: isTokens ? d.cacheReadTokens : 0,
        cacheCreationTokens: isTokens ? d.cacheCreationTokens : 0,
        actualCost: isTokens ? 0 : (costEntry?.actual ?? d.estimatedCostUsd),
        skillCost: isTokens ? 0 : (costEntry?.skill ?? 0),
        overlayValue: overlayByDate.get(overlayBucket === 'week' ? toFridayWeekKey(d.date) : d.date) ?? null,
      };
    });
    return period === 90 ? groupByWeek(dailyDataset) : dailyDataset;
  }, [items, period, mode, costByDate, overlayByDate, overlayBucket]);

  if (items.length === 0) return null;

  const isTokens = mode === 'tokens';
  const yFormatter = isTokens ? fmtTokens : fmtUsdShort;
  const seriesFormatter = (v: number | null) => (v == null || v === 0 ? null : yFormatter(v));
  const hasOverlay = overlay != null;
  const overlayLabel = isTokens ? t('chart.tokensPerLoc') : t('chart.costPerLoc');
  const overlayFormatter = (v: number | null) => {
    if (v == null) return null;
    if (isTokens) return `${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)} tok/LOC`;
    return v >= 0.01 ? `$${v.toFixed(4)}/LOC` : `¢${(v * 100).toFixed(2)}/LOC`;
  };
  const rightAxisFormatter = (v: number) => {
    if (isTokens) return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
    return v >= 0.01 ? `$${v.toFixed(2)}` : `¢${(v * 100).toFixed(1)}`;
  };

  const handleAxisClick = (_event: MouseEvent, data: { dataIndex: number } | null) => {
    const idx = data?.dataIndex;
    if (idx == null || idx < 0 || idx >= dataset.length) return;
    onDateClick?.(dataset[idx].fullDate);
  };

  const barSeries = isTokens ? [
    { type: 'bar' as const, dataKey: 'inputTokens', label: 'Input', stack: 'a', color: chartColors.input, yAxisId: 'left', valueFormatter: seriesFormatter },
    { type: 'bar' as const, dataKey: 'outputTokens', label: 'Output', stack: 'a', color: chartColors.output, yAxisId: 'left', valueFormatter: seriesFormatter },
    { type: 'bar' as const, dataKey: 'cacheReadTokens', label: 'Cache Read', stack: 'a', color: chartColors.cacheRead, yAxisId: 'left', valueFormatter: seriesFormatter },
    { type: 'bar' as const, dataKey: 'cacheCreationTokens', label: 'Cache Write', stack: 'a', color: chartColors.cacheWrite, yAxisId: 'left', valueFormatter: seriesFormatter },
  ] : [
    { type: 'bar' as const, dataKey: 'actualCost', label: 'Current', color: chartColors.primary, yAxisId: 'left', valueFormatter: seriesFormatter },
    { type: 'bar' as const, dataKey: 'skillCost', label: 'Optimized', color: chartColors.skill, yAxisId: 'left', valueFormatter: seriesFormatter },
  ];

  const overlaySeries = hasOverlay ? [{
    type: 'line' as const,
    dataKey: 'overlayValue',
    label: overlayLabel,
    color: chartColors.overlayPerLoc,
    yAxisId: 'right',
    connectNulls: true,
    showMark: true,
    valueFormatter: overlayFormatter,
  }] : [];

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <ChartsDataProvider
        dataset={dataset}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series={[...barSeries, ...overlaySeries] as any}
        xAxis={[{ id: 'date', scaleType: 'band', dataKey: 'date' }]}
        yAxis={[
          { id: 'left', valueFormatter: yFormatter },
          { id: 'right', position: 'right', valueFormatter: rightAxisFormatter },
        ]}
        height={240}
        margin={{ left: 16, right: hasOverlay ? 56 : 8, top: 8, bottom: 40 }}
        onAxisClick={period === 90 ? undefined : handleAxisClick}
      >
        <ChartsWrapper legendDirection="horizontal" legendPosition={{ vertical: 'bottom', horizontal: 'center' }}>
          <ChartsLegend />
          <ChartsSurface>
            <ChartsGrid horizontal />
            <BarPlot />
            {hasOverlay && <LinePlot />}
            {hasOverlay && <MarkPlot />}
            <ChartsAxisHighlight x="band" />
            <ChartsXAxis axisId="date" />
            <ChartsYAxis axisId="left" />
            {hasOverlay && <ChartsYAxis axisId="right" />}
          </ChartsSurface>
          <ChartsTooltip />
        </ChartsWrapper>
      </ChartsDataProvider>
    </Paper>
  );
}



// ---------------------------------------------------------------------------
//  Main component
// ---------------------------------------------------------------------------

// ─── Behavior charts in Analytics ───────────────────────────────────────────

type ChartMetric = 'count' | 'tokens';
type CombinedChartKind = 'tools' | 'errors' | 'skills' | 'models' | 'commits' | 'releases';

// スタック棒グラフの系列数が多すぎると描画・凡例・ツールチップが重くなるため、
// 上位 N 件以外を "Others" に集約する。
const MAX_STACKED_SERIES = 10;
const OTHERS_LABEL = 'Others';

function capTopN(
  totals: ReadonlyMap<string, number>,
  topN = MAX_STACKED_SERIES,
): { displayKeys: string[]; keyMap: Map<string, string> } {
  const sorted = [...totals.entries()].sort(([, a], [, b]) => b - a).map(([k]) => k);
  const keyMap = new Map<string, string>();
  if (sorted.length <= topN) {
    for (const k of sorted) keyMap.set(k, k);
    return { displayKeys: sorted, keyMap };
  }
  const top = sorted.slice(0, topN);
  const topSet = new Set(top);
  for (const k of sorted) keyMap.set(k, topSet.has(k) ? k : OTHERS_LABEL);
  return { displayKeys: [...top, OTHERS_LABEL], keyMap };
}

type CommitMetric = 'count' | 'loc' | 'leadTime';

function LeadTimeAxisTooltipContent({ unmappedByBucket, bucketKeys }: Readonly<{
  unmappedByBucket: Map<string, number>;
  bucketKeys: ReadonlyArray<string>;
}>) {
  const tooltipData = useAxesTooltip();
  if (tooltipData === null) return null;
  return (
    <ChartsTooltipPaper>
      {tooltipData.map(({ axisId, mainAxis, axisValue, axisFormattedValue, seriesItems, dataIndex }) => {
        const bucketKey = bucketKeys[dataIndex] ?? '';
        const unmapped = unmappedByBucket.get(bucketKey) ?? 0;
        return (
          <ChartsTooltipTable key={axisId}>
            {axisValue != null && !mainAxis.hideTooltip && (
              <Typography component="caption">{axisFormattedValue}</Typography>
            )}
            <tbody>
              {seriesItems.map((item) => (
                item.formattedValue == null || typeof item.formattedValue !== 'string' ? null : (
                  <ChartsTooltipRow key={item.seriesId}>
                    <ChartsTooltipCell component="th">
                      <ChartsLabelMark
                        type={item.markType}
                        markShape={item.markShape}
                        color={item.color}
                      />
                      {item.formattedLabel}
                    </ChartsTooltipCell>
                    <ChartsTooltipCell component="td">{item.formattedValue}</ChartsTooltipCell>
                  </ChartsTooltipRow>
                )
              ))}
              <ChartsTooltipRow>
                <ChartsTooltipCell component="th" sx={{ opacity: 0.7 }}>未マップ</ChartsTooltipCell>
                <ChartsTooltipCell component="td" sx={{ opacity: 0.7 }}>{unmapped} 件</ChartsTooltipCell>
              </ChartsTooltipRow>
            </tbody>
          </ChartsTooltipTable>
        );
      })}
    </ChartsTooltipPaper>
  );
}

function CombinedChartsContent({ data, periodDays, activeChart, toolMetric, modelMetric, commitMetric, leadTimeOverlay, onDateClick }: Readonly<{
  data: CombinedData | null;
  periodDays: PeriodDays;
  activeChart: CombinedChartKind;
  toolMetric: ChartMetric;
  modelMetric: ChartMetric;
  commitMetric: CommitMetric;
  leadTimeOverlay: {
    leadTimePerLoc: ReadonlyArray<{ bucketStart: string; value: number }>;
    unmapped: ReadonlyArray<{ bucketStart: string; value: number }>;
    byPrefix: {
      prefixes: ReadonlyArray<string>;
      series: ReadonlyArray<{ bucketStart: string; byPrefix: Readonly<Record<string, number>> }>;
    };
  } | null;
  onDateClick?: (fullDate: string) => void;
}>) {
  const { cardSx, toolPalette } = useTrailTheme();

  const axisInfo = useMemo(() => {
    if (!data) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const toolRows = (data.toolCounts ?? []).filter(r => r.period >= cutoffStr);
    const errorRows = (data.errorRate ?? []).filter(r => r.period >= cutoffStr);
    const skillRows = (data.skillStats ?? []).filter(r => r.period >= cutoffStr);
    const modelRows = (data.modelStats ?? []).filter(r => r.period >= cutoffStr);
    const commitRows = (data.commitPrefixStats ?? []).filter(r => r.period >= cutoffStr);
    const aiRateRows = (data.aiFirstTryRate ?? []).filter(r => r.period >= cutoffStr);
    const allPeriods = [...new Set(toolRows.map(r => r.period))].sort();
    const labels = allPeriods.map(p => p.length > 5 ? p.slice(5) : p);
    const modelPeriods = [...new Set(modelRows.map(r => r.period))].sort();
    const modelLabels = modelPeriods.map(p => p.length > 5 ? p.slice(5) : p);
    const commitPeriods = [...new Set(commitRows.map(r => r.period))].sort();
    const commitLabels = commitPeriods.map(p => p.length > 5 ? p.slice(5) : p);

    const toolTotals = new Map<string, number>();
    for (const r of toolRows) toolTotals.set(r.tool, (toolTotals.get(r.tool) ?? 0) + r.count);
    const errToolTotals = new Map<string, number>();
    for (const r of errorRows) for (const [k, v] of Object.entries(r.byTool)) errToolTotals.set(k, (errToolTotals.get(k) ?? 0) + v);
    const skillTotals = new Map<string, number>();
    for (const r of skillRows) skillTotals.set(r.skill, (skillTotals.get(r.skill) ?? 0) + r.count);
    const modelTotals = new Map<string, number>();
    for (const r of modelRows) modelTotals.set(r.model, (modelTotals.get(r.model) ?? 0) + r.count);
    const commitTotals = new Map<string, number>();
    for (const r of commitRows) commitTotals.set(r.prefix, (commitTotals.get(r.prefix) ?? 0) + r.count);

    const toolCap = capTopN(toolTotals);
    const errCap = capTopN(errToolTotals);
    const skillCap = capTopN(skillTotals);
    const modelCap = capTopN(modelTotals);
    const commitCap = capTopN(commitTotals);

    return {
      toolRows,
      errorRows,
      skillRows,
      modelRows,
      commitRows,
      aiRateRows,
      allPeriods,
      labels,
      modelPeriods,
      modelLabels,
      commitPeriods,
      commitLabels,
      tools: toolCap.displayKeys,
      toolMap: toolCap.keyMap,
      errTools: errCap.displayKeys,
      errMap: errCap.keyMap,
      skills: skillCap.displayKeys,
      skillMap: skillCap.keyMap,
      models: modelCap.displayKeys,
      modelMap: modelCap.keyMap,
      commitPrefixes: commitCap.displayKeys,
      commitMap: commitCap.keyMap,
    };
  }, [data, periodDays]);

  const toolDataset = useMemo(() => {
    if (!axisInfo) return [];
    const { toolRows, allPeriods, labels, tools, toolMap } = axisInfo;
    const getValue = (r: { count: number; tokens?: number }): number =>
      toolMetric === 'tokens' ? (r.tokens ?? 0) : r.count;
    const valMap = new Map<string, number>();
    for (const r of toolRows) {
      const displayKey = toolMap.get(r.tool) ?? r.tool;
      const key = `${r.period}::${displayKey}`;
      valMap.set(key, (valMap.get(key) ?? 0) + getValue(r));
    }
    return allPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: labels[pi] };
      for (let i = 0; i < tools.length; i++) {
        entry[`t${i}`] = valMap.get(`${p}::${tools[i]}`) ?? 0;
      }
      return entry;
    });
  }, [axisInfo, toolMetric]);

  const errDataset = useMemo(() => {
    if (!axisInfo) return [];
    const { errorRows, allPeriods, labels, errTools, errMap } = axisInfo;
    const valMap = new Map<string, number>();
    for (const r of errorRows) {
      for (const [tool, v] of Object.entries(r.byTool)) {
        const displayKey = errMap.get(tool) ?? tool;
        const key = `${r.period}::${displayKey}`;
        valMap.set(key, (valMap.get(key) ?? 0) + v);
      }
    }
    return allPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: labels[pi] };
      for (let i = 0; i < errTools.length; i++) {
        entry[`e${i}`] = valMap.get(`${p}::${errTools[i]}`) ?? 0;
      }
      return entry;
    });
  }, [axisInfo]);

  const skillDataset = useMemo(() => {
    if (!axisInfo) return [];
    const { skillRows, allPeriods, labels, skills, skillMap } = axisInfo;
    const countMap = new Map<string, number>();
    for (const r of skillRows) {
      const displayKey = skillMap.get(r.skill) ?? r.skill;
      const key = `${r.period}::${displayKey}`;
      countMap.set(key, (countMap.get(key) ?? 0) + r.count);
    }
    return allPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: labels[pi] };
      for (let i = 0; i < skills.length; i++) {
        entry[`s${i}`] = countMap.get(`${p}::${skills[i]}`) ?? 0;
      }
      return entry;
    });
  }, [axisInfo]);

  const commitDataset = useMemo(() => {
    if (!axisInfo) return [];
    const { commitRows, commitPeriods, commitLabels, commitPrefixes, commitMap } = axisInfo;
    const valMap = new Map<string, number>();
    for (const r of commitRows) {
      const displayKey = commitMap.get(r.prefix) ?? r.prefix;
      const key = `${r.period}::${displayKey}`;
      const value = commitMetric === 'loc' ? (r.linesAdded ?? 0) : r.count;
      valMap.set(key, (valMap.get(key) ?? 0) + value);
    }
    return commitPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: commitLabels[pi] };
      for (let i = 0; i < commitPrefixes.length; i++) {
        entry[`c${i}`] = valMap.get(`${p}::${commitPrefixes[i]}`) ?? 0;
      }
      return entry;
    });
  }, [axisInfo, commitMetric]);

  const modelDataset = useMemo(() => {
    if (!axisInfo) return [];
    const { modelRows, modelPeriods, modelLabels, models, modelMap } = axisInfo;
    const getValue = (r: { count: number; tokens: number }): number =>
      modelMetric === 'tokens' ? r.tokens : r.count;
    const valMap = new Map<string, number>();
    for (const r of modelRows) {
      const displayKey = modelMap.get(r.model) ?? r.model;
      const key = `${r.period}::${displayKey}`;
      valMap.set(key, (valMap.get(key) ?? 0) + getValue(r));
    }
    return modelPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: modelLabels[pi] };
      for (let i = 0; i < models.length; i++) {
        entry[`m${i}`] = valMap.get(`${p}::${models[i]}`) ?? 0;
      }
      return entry;
    });
  }, [axisInfo, modelMetric]);

  if (!axisInfo) return null;
  const { toolRows, errTools, tools, skills, models, commitPrefixes, aiRateRows, allPeriods, modelPeriods, commitPeriods, commitLabels } = axisInfo;
  const hideZero = (v: number | null) => (v == null || v === 0 ? null : String(v));
  const canDrill = periodDays < 90 && !!onDateClick;
  const makeAxisClick = (periods: readonly string[]) =>
    canDrill
      ? (_e: MouseEvent, d: { dataIndex: number } | null) => {
          const idx = d?.dataIndex;
          if (idx == null || idx < 0 || idx >= periods.length) return;
          onDateClick?.(periods[idx]);
        }
      : undefined;

  if (activeChart === 'tools') {
    if (toolRows.length === 0) {
      return <Typography variant="body2" color="text.secondary">0</Typography>;
    }
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <BarChart
          dataset={toolDataset}
          xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
          yAxis={[{ valueFormatter: fmtTokens }]}
          series={tools.map((tool, i) => ({
            dataKey: `t${i}`,
            label: tool,
            stack: 'total',
            color: toolPalette[i % toolPalette.length],
            valueFormatter: hideZero,
          }))}
          height={240}
          margin={{ left: 16, right: 8, top: 8, bottom: 60 }}
          slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
          onAxisClick={makeAxisClick(allPeriods)}
        />
      </Paper>
    );
  }

  if (activeChart === 'errors') {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        {errTools.length === 0 ? (
          <Typography variant="body2" color="text.secondary">0</Typography>
        ) : (
          <BarChart
            dataset={errDataset}
            xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
            yAxis={[{ valueFormatter: fmtTokens }]}
            series={errTools.map((tool, i) => ({
              dataKey: `e${i}`,
              label: tool,
              stack: 'total',
              color: toolPalette[i % toolPalette.length],
              valueFormatter: hideZero,
            }))}
            height={240}
            margin={{ left: 16, right: 8, top: 8, bottom: 40 }}
            slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
            onAxisClick={makeAxisClick(allPeriods)}
          />
        )}
      </Paper>
    );
  }

  if (activeChart === 'skills') {
    if (skills.length === 0) {
      return <Typography variant="body2" color="text.secondary">0</Typography>;
    }
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <BarChart
          dataset={skillDataset}
          xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
          yAxis={[{ valueFormatter: fmtNum }]}
          series={skills.map((skill, i) => ({
            dataKey: `s${i}`,
            label: skill,
            stack: 'total',
            color: toolPalette[i % toolPalette.length],
            valueFormatter: hideZero,
          }))}
          height={240}
          margin={{ left: 16, right: 8, top: 8, bottom: 40 }}
          slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
          onAxisClick={makeAxisClick(allPeriods)}
        />
      </Paper>
    );
  }

  if (activeChart === 'commits') {
    if (commitMetric === 'leadTime') {
      const ratioRows = leadTimeOverlay?.leadTimePerLoc ?? [];
      const byPrefixSeries = leadTimeOverlay?.byPrefix.series ?? [];
      const allPrefixes = leadTimeOverlay?.byPrefix.prefixes ?? [];
      if (byPrefixSeries.length === 0 && ratioRows.length === 0) {
        return <Typography variant="body2" color="text.secondary">0</Typography>;
      }

      const ltTotals = new Map<string, number>();
      for (const row of byPrefixSeries) {
        for (const [p, v] of Object.entries(row.byPrefix)) {
          ltTotals.set(p, (ltTotals.get(p) ?? 0) + v);
        }
      }
      const ltCap = capTopN(ltTotals);
      const ltPrefixes = ltCap.displayKeys;
      const ltMap = ltCap.keyMap;

      const unmappedRows = leadTimeOverlay?.unmapped ?? [];
      const bucketKeys = [...new Set([
        ...byPrefixSeries.map((r) => r.bucketStart),
        ...ratioRows.map((r) => r.bucketStart),
      ])].sort();
      const ratioByBucket = new Map(ratioRows.map((r) => [r.bucketStart, r.value]));
      const prefixRowByBucket = new Map(byPrefixSeries.map((r) => [r.bucketStart, r.byPrefix]));
      const unmappedByBucket = new Map(unmappedRows.map((r) => [r.bucketStart, r.value]));
      const fullDates = bucketKeys.map((b) => b.slice(0, 10));
      const labels = bucketKeys.map((b) => b.slice(5, 10));

      const ltDataset = bucketKeys.map((b, i) => {
        const byPrefix = prefixRowByBucket.get(b) ?? {};
        const aggregated: Record<string, number> = {};
        for (const p of ltPrefixes) aggregated[p] = 0;
        for (const origPrefix of allPrefixes) {
          const displayKey = ltMap.get(origPrefix) ?? origPrefix;
          aggregated[displayKey] = (aggregated[displayKey] ?? 0) + (byPrefix[origPrefix] ?? 0);
        }
        const entry: Record<string, string | number | null> = { period: labels[i] };
        for (let k = 0; k < ltPrefixes.length; k++) {
          entry[`l${k}`] = aggregated[ltPrefixes[k]] ?? 0;
        }
        entry.leadTimePerLoc = ratioByBucket.get(b) ?? null;
        return entry;
      });

      const fmtMin = (v: number | null) => v == null ? '-' : `${Math.round(v).toLocaleString()} min`;
      const fmtRatio = (v: number | null) => v == null ? '-' : `${v.toFixed(2)} min/LOC`;

      const barSeries = ltPrefixes.map((prefix, i) => ({
        type: 'bar' as const,
        dataKey: `l${i}`,
        label: prefix,
        stack: 'total',
        color: toolPalette[i % toolPalette.length],
        yAxisId: 'minAxis',
        valueFormatter: (v: number | null) => v == null || v === 0 ? null : fmtMin(v),
      }));
      const lineSeries = [{
        type: 'line' as const,
        dataKey: 'leadTimePerLoc',
        label: 'Lead Time / LOC (min/LOC)',
        color: '#F06292',
        yAxisId: 'ratioAxis',
        showMark: true,
        connectNulls: true,
        valueFormatter: fmtRatio,
      }];

      return (
        <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
          <ChartsDataProvider
            dataset={ltDataset}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            series={[...barSeries, ...lineSeries] as any}
            xAxis={[{ id: 'period', scaleType: 'band', dataKey: 'period' }]}
            yAxis={[
              { id: 'minAxis', valueFormatter: fmtTokens },
              { id: 'ratioAxis', position: 'right' as const, valueFormatter: (v: number) => v.toFixed(2) },
            ]}
            height={260}
            margin={{ left: 16, right: 56, top: 8, bottom: 40 }}
            onAxisClick={canDrill
              ? (_e: MouseEvent, d: { dataIndex: number } | null) => {
                  const idx = d?.dataIndex;
                  if (idx == null || idx < 0 || idx >= fullDates.length) return;
                  onDateClick?.(fullDates[idx]);
                }
              : undefined}
          >
            <ChartsWrapper legendDirection="horizontal" legendPosition={{ vertical: 'bottom', horizontal: 'center' }}>
              <ChartsLegend />
              <ChartsSurface>
                <ChartsGrid horizontal />
                <BarPlot />
                <LinePlot />
                <MarkPlot />
                <ChartsAxisHighlight x="band" />
                <ChartsXAxis axisId="period" />
                <ChartsYAxis axisId="minAxis" />
                <ChartsYAxis axisId="ratioAxis" />
              </ChartsSurface>
              <ChartsTooltipContainer trigger="axis">
                <LeadTimeAxisTooltipContent
                  unmappedByBucket={unmappedByBucket}
                  bucketKeys={bucketKeys}
                />
              </ChartsTooltipContainer>
            </ChartsWrapper>
          </ChartsDataProvider>
        </Paper>
      );
    }

    if (commitPrefixes.length === 0) {
      return <Typography variant="body2" color="text.secondary">0</Typography>;
    }
    const showRate = commitMetric === 'count';
    const rateByPeriod = new Map<string, number | null>();
    if (showRate) {
      for (const r of aiRateRows) {
        rateByPeriod.set(r.period, r.sampleSize > 0 ? r.rate : null);
      }
    }
    const augmentedDataset = commitDataset.map((row, i) => ({
      ...row,
      rate: showRate ? (rateByPeriod.get(commitPeriods[i]) ?? null) : null,
    }));

    const barSeries = commitPrefixes.map((prefix, i) => ({
      type: 'bar' as const,
      dataKey: `c${i}`,
      label: prefix,
      stack: 'total',
      color: toolPalette[i % toolPalette.length],
      yAxisId: 'countAxis',
    }));
    const lineSeries = showRate ? [{
      type: 'line' as const,
      dataKey: 'rate',
      label: 'AI 1 発成功率 (%)',
      color: '#F06292',
      yAxisId: 'rateAxis',
      showMark: true,
      connectNulls: true,
      valueFormatter: (v: number | null) => v == null ? '-' : `${v.toFixed(1)}%`,
    }] : [];

    const yAxisConfig = showRate
      ? [
          { id: 'countAxis', valueFormatter: fmtTokens },
          { id: 'rateAxis', min: 0, max: 100, position: 'right' as const, valueFormatter: (v: number) => `${v}%` },
        ]
      : [{ id: 'countAxis', valueFormatter: fmtTokens }];

    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <ChartsDataProvider
          dataset={augmentedDataset}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          series={[...barSeries, ...lineSeries] as any}
          xAxis={[{ id: 'period', scaleType: 'band', dataKey: 'period' }]}
          yAxis={yAxisConfig}
          height={260}
          margin={{ left: 16, right: showRate ? 48 : 8, top: 8, bottom: 40 }}
          onAxisClick={makeAxisClick(commitPeriods)}
        >
          <ChartsWrapper legendDirection="horizontal" legendPosition={{ vertical: 'bottom', horizontal: 'center' }}>
            <ChartsLegend />
            <ChartsSurface>
              <ChartsGrid horizontal />
              <BarPlot />
              {showRate && <LinePlot />}
              {showRate && <MarkPlot />}
              <ChartsAxisHighlight x="band" />
              <ChartsXAxis axisId="period" />
              <ChartsYAxis axisId="countAxis" />
              {showRate && <ChartsYAxis axisId="rateAxis" />}
            </ChartsSurface>
            <ChartsTooltip />
          </ChartsWrapper>
        </ChartsDataProvider>
      </Paper>
    );
  }

  // activeChart === 'models'
  if (models.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <BarChart
        dataset={modelDataset}
        xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
        yAxis={[{ valueFormatter: fmtTokens }]}
        series={models.map((model, i) => ({
          dataKey: `m${i}`,
          label: model,
          stack: 'total',
          color: toolPalette[i % toolPalette.length],
          valueFormatter: hideZero,
        }))}
        height={240}
        margin={{ left: 16, right: 8, top: 8, bottom: 40 }}
        slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
        onAxisClick={makeAxisClick(modelPeriods)}
      />
    </Paper>
  );
}

function ReleasesBarChart({ timeSeries }: Readonly<{
  timeSeries: ReadonlyArray<ReleaseQualityBucket>;
}>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();

  if (timeSeries.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">{t('metrics.empty')}</Typography>
      </Paper>
    );
  }

  const fmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' });
  const dataset = timeSeries.map((d) => ({
    label: fmt.format(new Date(d.bucketStart)),
    succeeded: d.succeeded,
    failed: d.failed,
  }));

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'label' }]}
        series={[
          { dataKey: 'succeeded', label: t('analytics.combined.releaseSucceeded'), color: '#4CAF50', stack: 'releases' },
          { dataKey: 'failed', label: t('analytics.combined.releaseFailed'), color: '#f44336', stack: 'releases' },
        ]}
        height={240}
        margin={{ left: 16, right: 8, top: 8, bottom: 40 }}
      />
    </Paper>
  );
}

type CombinedMetric = 'tokens' | 'tools' | 'errors' | 'skills' | 'models' | 'commits' | 'releases';

function CombinedChartsSection({
  dailyActivity,
  sessions,
  sessionsLoading,
  period,
  setPeriod,
  onSelectSession,
  onJumpToTrace,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
  fetchDayToolMetrics,
  costOptimization,
  fetchCombinedData,
  fetchQualityMetrics,
  fetchReleaseQuality,
}: Readonly<{
  dailyActivity: AnalyticsData['dailyActivity'];
  sessions: readonly TrailSession[];
  sessionsLoading?: boolean;
  period: PeriodDays;
  setPeriod: (v: PeriodDays) => void;
  onSelectSession?: (id: string) => void;
  onJumpToTrace?: (session: TrailSession) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  fetchDayToolMetrics?: (date: string) => Promise<ToolMetrics | null>;
  costOptimization?: CostOptimizationData | null;
  fetchCombinedData?: (period: CombinedPeriodMode, rangeDays: CombinedRangeDays) => Promise<CombinedData>;
  fetchQualityMetrics?: (range: DateRange) => Promise<QualityMetrics | null>;
  fetchReleaseQuality?: (range: DateRange, bucket: 'day' | 'week') => Promise<ReadonlyArray<ReleaseQualityBucket>>;
}>) {
  const { colors } = useTrailTheme();
  const { t } = useTrailI18n();
  const [metric, setMetric] = useState<CombinedMetric>('tokens');
  const [tokenMode, setTokenMode] = useState<DailyViewMode>('tokens');
  const [toolMetric, setToolMetric] = useState<ChartMetric>('count');
  const [modelMetric, setModelMetric] = useState<ChartMetric>('count');
  const [commitMetric, setCommitMetric] = useState<CommitMetric>('count');
  const [combinedData, setCombinedData] = useState<CombinedData | null>(null);
  const [combinedLoading, setCombinedLoading] = useState(false);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [releasesTimeSeries, setReleasesTimeSeries] = useState<ReadonlyArray<ReleaseQualityBucket>>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [overlay, setOverlay] = useState<{
    bucket: 'day' | 'week';
    tokens: ReadonlyArray<{ bucketStart: string; value: number }>;
    cost: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTime: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTimePerLoc: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTimeUnmapped: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTimeByPrefix: {
      prefixes: ReadonlyArray<string>;
      series: ReadonlyArray<{ bucketStart: string; byPrefix: Readonly<Record<string, number>> }>;
    };
    deploymentFrequency: ReadonlyArray<{ bucketStart: string; value: number }>;
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => { setSelectedDate(null); }, [period]);
  const handleDateClick = (fullDate: string) => {
    setSelectedDate((prev) => (prev === fullDate ? null : fullDate));
  };

  // Prefetch behavior data so switching to Tool/Error/Skill does not block on fetch.
  useEffect(() => {
    if (!fetchCombinedData) return;
    const rangeDays: CombinedRangeDays = period >= 90 ? 90 : 30;
    const periodMode: CombinedPeriodMode = period >= 90 ? 'week' : 'day';
    let mounted = true;
    setCombinedLoading(true);
    void (async () => {
      const result = await fetchCombinedData(periodMode, rangeDays);
      if (mounted) {
        setCombinedData(result);
        setCombinedLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [fetchCombinedData, period]);

  useEffect(() => {
    if (!fetchQualityMetrics) return;
    if (metric === 'releases') return; // Release chart uses fetchReleaseQuality; skip heavy quality metrics fetch
    const now = new Date();
    const to = now.toISOString();
    const from = new Date(now.getTime() - period * 86_400_000).toISOString();
    let mounted = true;
    setOverlayLoading(true);
    void (async () => {
      const result = await fetchQualityMetrics({ from, to });
      if (mounted) {
        setOverlayLoading(false);
      }
      if (mounted && result) {
        setOverlay({
          bucket: result.bucket,
          tokens: result.metrics.tokensPerLoc.timeSeries,
          cost: result.costPerLocTimeSeries ?? [],
          leadTime: result.leadTimeMinTimeSeries ?? [],
          leadTimePerLoc: result.metrics.leadTimePerLoc.timeSeries,
          leadTimeUnmapped: result.leadTimeUnmappedTimeSeries ?? [],
          leadTimeByPrefix: result.leadTimeMinByPrefix ?? { prefixes: [], series: [] },
          deploymentFrequency: result.metrics.deploymentFrequency.timeSeries,
        });
      }
    })();
    return () => { mounted = false; };
  }, [fetchQualityMetrics, period, metric]);

  useEffect(() => {
    if (!fetchReleaseQuality) return;
    const now = new Date();
    const to = now.toISOString();
    const from = new Date(now.getTime() - period * 86_400_000).toISOString();
    const bucket: 'day' | 'week' = period >= 90 ? 'week' : 'day';
    let mounted = true;
    setReleasesLoading(true);
    void (async () => {
      const result = await fetchReleaseQuality({ from, to }, bucket);
      if (mounted) {
        setReleasesTimeSeries(result);
        setReleasesLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [fetchReleaseQuality, period]);

  const toggleSx = {
    color: colors.textSecondary,
    borderColor: colors.border,
    '&.Mui-selected': { color: colors.iceBlue, bgcolor: colors.iceBlueBg, borderColor: colors.iceBlue },
    '&:hover': { bgcolor: colors.hoverBg },
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            value={metric}
            exclusive
            onChange={(_e, v: CombinedMetric | null) => { if (v) setMetric(v); }}
            size="small"
          >
            <ToggleButton value="tokens" sx={toggleSx}>{t('chart.tokenUsage')}</ToggleButton>
            <ToggleButton value="models" sx={toggleSx}>{t('analytics.combined.model')}</ToggleButton>
            <ToggleButton value="skills" sx={toggleSx}>{t('analytics.combined.skill')}</ToggleButton>
            <ToggleButton value="tools" sx={toggleSx}>{t('analytics.combined.tool')}</ToggleButton>
            <ToggleButton value="errors" sx={toggleSx}>{t('analytics.combined.error')}</ToggleButton>
            <ToggleButton value="commits" sx={toggleSx}>{t('analytics.combined.commitPrefix')}</ToggleButton>
            <ToggleButton value="releases" sx={toggleSx}>{t('analytics.combined.release')}</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={(_e, v: PeriodDays | null) => { if (v) setPeriod(v); }}
            size="small"
          >
            <ToggleButton value={7} sx={toggleSx}>7d</ToggleButton>
            <ToggleButton value={30} sx={toggleSx}>30d</ToggleButton>
            {process.env.NEXT_PUBLIC_SHOW_UNLIMITED === '1' && (
              <ToggleButton value={90} sx={toggleSx}>90d</ToggleButton>
            )}
          </ToggleButtonGroup>
        </Box>
        {metric === 'tokens' && (
          <ToggleButtonGroup
            value={tokenMode}
            exclusive
            onChange={(_e, v: DailyViewMode | null) => { if (v) setTokenMode(v); }}
            size="small"
          >
            <ToggleButton value="tokens" sx={toggleSx}>{t('chart.tokens')}</ToggleButton>
            <ToggleButton value="cost" sx={toggleSx}>{t('chart.cost')}</ToggleButton>
          </ToggleButtonGroup>
        )}
        {metric === 'tools' && (
          <ToggleButtonGroup
            value={toolMetric}
            exclusive
            onChange={(_e, v: ChartMetric | null) => { if (v) setToolMetric(v); }}
            size="small"
          >
            <ToggleButton value="count" sx={toggleSx}>{t('analytics.combined.count')}</ToggleButton>
            <ToggleButton value="tokens" sx={toggleSx}>{t('analytics.combined.tokens')}</ToggleButton>
          </ToggleButtonGroup>
        )}
        {metric === 'models' && (
          <ToggleButtonGroup
            value={modelMetric}
            exclusive
            onChange={(_e, v: ChartMetric | null) => { if (v) setModelMetric(v); }}
            size="small"
          >
            <ToggleButton value="count" sx={toggleSx}>{t('analytics.combined.count')}</ToggleButton>
            <ToggleButton value="tokens" sx={toggleSx}>{t('analytics.combined.tokens')}</ToggleButton>
          </ToggleButtonGroup>
        )}
        {metric === 'commits' && (
          <ToggleButtonGroup
            value={commitMetric}
            exclusive
            onChange={(_e, v: CommitMetric | null) => { if (v) setCommitMetric(v); }}
            size="small"
          >
            <ToggleButton value="count" sx={toggleSx}>{t('analytics.combined.commitCount')}</ToggleButton>
            <ToggleButton value="loc" sx={toggleSx}>{t('analytics.combined.loc')}</ToggleButton>
            <ToggleButton value="leadTime" sx={toggleSx}>{t('analytics.combined.leadTime')}</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>
      {metric === 'tokens' ? (
        <DailyActivityChart
          items={dailyActivity}
          period={period}
          mode={tokenMode}
          onDateClick={handleDateClick}
          costOptimization={costOptimization}
          overlay={overlay}
        />
      ) : metric === 'releases' ? (
        releasesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <ReleasesBarChart timeSeries={releasesTimeSeries} />
        )
      ) : fetchCombinedData ? (
        combinedLoading && !combinedData ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <CombinedChartsContent
            data={combinedData}
            periodDays={period}
            activeChart={metric}
            toolMetric={toolMetric}
            modelMetric={modelMetric}
            commitMetric={commitMetric}
            leadTimeOverlay={overlay ? { leadTimePerLoc: overlay.leadTimePerLoc, unmapped: overlay.leadTimeUnmapped, byPrefix: overlay.leadTimeByPrefix } : null}
            onDateClick={handleDateClick}
          />
        )
      ) : null}
      {selectedDate && period !== 90 && (
        <DailySessionList
          date={selectedDate}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          onSelectSession={onSelectSession}
          onJumpToTrace={onJumpToTrace}
          fetchSessionMessages={fetchSessionMessages}
          fetchSessionCommits={fetchSessionCommits}
          fetchSessionToolMetrics={fetchSessionToolMetrics}
          fetchDayToolMetrics={fetchDayToolMetrics}
        />
      )}
    </Box>
  );
}

export function AnalyticsPanel({ analytics, sessions = [], sessionsLoading, onSelectSession, onJumpToTrace, fetchSessionMessages, fetchSessionCommits, fetchSessionToolMetrics, fetchDayToolMetrics, costOptimization, fetchCombinedData, fetchQualityMetrics, fetchDeploymentFrequency, fetchReleaseQuality }: Readonly<AnalyticsPanelProps>) {
  const { t } = useTrailI18n();
  const { scrollbarSx } = useTrailTheme();
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [overviewQualityMetrics, setOverviewQualityMetrics] = useState<QualityMetrics | null>(null);

  useEffect(() => {
    if (!fetchQualityMetrics) return;
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    void fetchQualityMetrics({ from: from.toISOString(), to: to.toISOString() }).then((result) => {
      if (result) setOverviewQualityMetrics(result);
    });
  }, [fetchQualityMetrics]);

  if (!analytics) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">
          {t('analytics.loadingAnalytics')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ overflow: 'auto', flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 3, ...scrollbarSx }}>
      <OverviewCards totals={analytics.totals} sessions={sessions} qualityMetrics={overviewQualityMetrics} />
      <ToolUsageChart items={analytics.toolUsage} />
      <CombinedChartsSection
        dailyActivity={analytics.dailyActivity}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        period={period}
        setPeriod={setPeriod}
        onSelectSession={onSelectSession}
        onJumpToTrace={onJumpToTrace}
        fetchSessionMessages={fetchSessionMessages}
        fetchSessionCommits={fetchSessionCommits}
        fetchSessionToolMetrics={fetchSessionToolMetrics}
        fetchDayToolMetrics={fetchDayToolMetrics}
        costOptimization={costOptimization}
        fetchCombinedData={fetchCombinedData}
        fetchQualityMetrics={fetchQualityMetrics}
        fetchReleaseQuality={fetchReleaseQuality}
      />
    </Box>
  );
}
