import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
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
import type { SxProps, Theme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { formatLocalTime, toLocalDateKey } from '@anytime-markdown/trail-core/formatDate';
import type { AnalyticsData, BehaviorData, BehaviorPeriodMode, BehaviorRangeDays, CostOptimizationData, ToolMetrics, TrailMessage, TrailSession, TrailSessionCommit, TrailTokenUsage } from '../parser/types';
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
  readonly costOptimization?: CostOptimizationData | null;
  readonly fetchBehaviorData?: (period: BehaviorPeriodMode, rangeDays: BehaviorRangeDays) => Promise<BehaviorData>;
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

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${parseFloat((n / 1_000_000_000).toFixed(1))}B`;
  if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${parseFloat((n / 1_000).toFixed(1))}K`;
  return String(n);
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
        '&:hover': { backgroundColor: 'action.hover' },
        userSelect: 'none',
      }}
      onClick={onCycle}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, textAlign: 'left' }}>
        {groupName}
      </Typography>
      <Typography variant="h5" sx={{ mt: 0.5 }}>
        {current.value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {current.label}
      </Typography>
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

function OverviewCards({
  totals,
  sessions = [],
}: Readonly<{
  totals: AnalyticsData['totals'];
  sessions?: readonly TrailSession[];
}>) {
  const { colors, cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [usageIdx, setUsageIdx] = useState(0);
  const [productivityIdx, setProductivityIdx] = useState(0);
  const [qualityIdx, setQualityIdx] = useState(0);
  const [toolIdx, setToolIdx] = useState(0);
  const totalInput = totals.inputTokens + totals.cacheReadTokens;
  const cacheHitRate = totalInput > 0
    ? fmtPercent(totals.cacheReadTokens / totalInput)
    : '\u2014';

  const cards = [
    { label: t('analytics.totalSessions'), value: fmtNum(totals.sessions) },
    { label: t('analytics.totalTokens'), value: fmtTokens(totals.inputTokens + totals.outputTokens) },
    { label: t('analytics.estimatedCost'), value: fmtUsd(totals.estimatedCostUsd) },
    { label: t('analytics.cacheHitRate'), value: cacheHitRate },
  ];

  const totalTokens = totals.inputTokens + totals.outputTokens;
  const hasLines = totals.totalLinesAdded > 0;
  const commitCards = [
    { label: t('analytics.totalCommits'), value: fmtNum(totals.totalCommits) },
    { label: t('analytics.linesAdded'), value: fmtNum(totals.totalLinesAdded) },
    { label: t('analytics.tokensPerLine'), value: hasLines
        ? fmtTokens(Math.round(totalTokens / totals.totalLinesAdded))
        : '\u2014' },
    { label: t('analytics.costPerLine'), value: hasLines
        ? fmtUsd(totals.estimatedCostUsd / totals.totalLinesAdded)
        : '\u2014' },
  ];

  const totalDurationHours = totals.totalSessionDurationMs / 3_600_000;

  const sessionsWithContext = sessions.filter(
    (s) => s.messageCount > 0 && (s.peakContextTokens ?? 0) > 0,
  );
  const avgContextGrowth = sessionsWithContext.length > 0
    ? sessionsWithContext.reduce(
        (sum, s) => sum + ((s.peakContextTokens ?? 0) - (s.initialContextTokens ?? 0)) / s.messageCount,
        0,
      ) / sessionsWithContext.length
    : 0;

  const efficiencyCards = [
    { label: t('analytics.aiCommitPercent'), value: totals.totalCommits > 0
        ? fmtPercent(totals.totalAiAssistedCommits / totals.totalCommits)
        : '\u2014' },
    { label: t('analytics.avgLinesPerHour'), value: totalDurationHours > 0 && totals.totalLinesAdded > 0
        ? fmtNum(Math.round(totals.totalLinesAdded / totalDurationHours))
        : '\u2014' },
    { label: t('analytics.avgCostPerHour'), value: totalDurationHours > 0
        ? fmtUsd(totals.estimatedCostUsd / totalDurationHours)
        : '\u2014' },
    { label: t('analytics.avgContextGrowth'), value: avgContextGrowth > 0
        ? `${fmtTokens(Math.round(avgContextGrowth))}/step`
        : '\u2014' },
  ];

  const hasToolMetrics = totals.totalEdits > 0 || totals.totalBuildRuns > 0 || totals.totalTestRuns > 0;
  const toolMetricsCards = [
    { label: t('analytics.retryRate'), value: totals.totalEdits > 0
        ? fmtPercent(totals.totalRetries / totals.totalEdits)
        : '\u2014' },
    { label: t('analytics.buildFailRate'), value: totals.totalBuildRuns > 0
        ? fmtPercent(totals.totalBuildFails / totals.totalBuildRuns)
        : '\u2014' },
    { label: t('analytics.testFailRate'), value: totals.totalTestRuns > 0
        ? fmtPercent(totals.totalTestFails / totals.totalTestRuns)
        : '\u2014' },
  ];

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
      {totals.totalCommits > 0 && (
        <CyclingCard
          groupName={t('analytics.groupProductivity')}
          items={commitCards}
          index={productivityIdx}
          onCycle={() => setProductivityIdx((i) => (i + 1) % commitCards.length)}
          cardStyle={cardStyle}
        />
      )}
      {totals.totalCommits > 0 && (
        <CyclingCard
          groupName={t('analytics.groupQuality')}
          items={efficiencyCards}
          index={qualityIdx}
          onCycle={() => setQualityIdx((i) => (i + 1) % efficiencyCards.length)}
          cardStyle={cardStyle}
        />
      )}
      {hasToolMetrics && (
        <CyclingCard
          groupName={t('analytics.groupToolMetrics')}
          items={toolMetricsCards}
          index={toolIdx}
          onCycle={() => setToolIdx((i) => (i + 1) % toolMetricsCards.length)}
          cardStyle={cardStyle}
        />
      )}
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

function SessionCacheTimeline({
  messages,
}: Readonly<{
  messages: readonly TrailMessage[];
}>) {
  const { colors, chartColors, cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const assistantMsgs = messages.filter((m) => m.type === 'assistant' && m.usage);
  const hasData = assistantMsgs.length > 0;

  const byUuid = useMemo(() => {
    const map = new Map<string, TrailMessage>();
    for (const m of messages) map.set(m.uuid, m);
    return map;
  }, [messages]);

  const dataset = useMemo(() => {
    let cumulativeMs = 0;
    return assistantMsgs.map((m, i) => {
      const parent = m.parentUuid ? byUuid.get(m.parentUuid) : undefined;
      if (parent?.timestamp && m.timestamp) {
        const delta = new Date(m.timestamp).getTime() - new Date(parent.timestamp).getTime();
        if (delta > 0) cumulativeMs += delta;
      }
      return {
        turn: i + 1,
        inputTokens: m.usage?.inputTokens ?? 0,
        outputTokens: m.usage?.outputTokens ?? 0,
        cacheReadTokens: m.usage?.cacheReadTokens ?? 0,
        cacheCreationTokens: m.usage?.cacheCreationTokens ?? 0,
        cumulativeMs,
      };
    });
  }, [assistantMsgs, byUuid]);

  const totalTurns = dataset.length;
  const tickStep = totalTurns <= 100 ? 10 : totalTurns <= 500 ? 50 : 100;

  return (
    <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5 }}>
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2">
          {t('analytics.sessionCacheTimelineTitle')} {hasData && `(${assistantMsgs.length} ${t('analytics.turns')})`}
        </Typography>
      </Box>
      {hasData ? (
        <LineChart
          dataset={dataset}
          xAxis={[{ dataKey: 'turn', scaleType: 'point', tickInterval: (value: number) => value % tickStep === 0 }]}
          yAxis={[
            { id: 'tokens', valueFormatter: fmtTokens },
            { id: 'time', position: 'right', valueFormatter: fmtDurationShort },
          ]}
          series={[
            { dataKey: 'inputTokens', label: t('analytics.chartInput'), color: chartColors.input, showMark: false, yAxisId: 'tokens' },
            { dataKey: 'outputTokens', label: t('analytics.chartOutput'), color: chartColors.output, showMark: false, yAxisId: 'tokens' },
            { dataKey: 'cacheReadTokens', label: t('analytics.chartCacheRead'), color: chartColors.cacheRead, showMark: false, yAxisId: 'tokens' },
            { dataKey: 'cacheCreationTokens', label: t('analytics.chartCacheWrite'), color: chartColors.cacheWrite, showMark: false, yAxisId: 'tokens' },
            {
              dataKey: 'cumulativeMs',
              label: t('analytics.chartCumulativeInferenceTime'),
              color: chartColors.cumulativeTime,
              showMark: false,
              yAxisId: 'time',
              valueFormatter: (v) => (v == null ? '' : fmtDurationShort(v)),
            },
          ]}
          height={200}
          margin={{ left: 0, right: 16, top: 16, bottom: 0 }}
          slotProps={{
            legend: { direction: 'horizontal', position: { vertical: 'top', horizontal: 'end' } },
          }}
        />
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
    { label: t('analytics.tokensPerStep'), value: s.messageCount > 0 ? fmtTokens(Math.round(totalTokens / s.messageCount)) : '\u2014' },
    { label: t('analytics.costPerStep'), value: s.messageCount > 0 ? fmtUsd(cost / s.messageCount) : '\u2014' },
    { label: t('analytics.cacheHit'), value: cacheInput > 0 ? fmtPercent(cacheHitRate) : '\u2014' },
    { label: t('analytics.outputRatio'), value: cacheInput > 0 ? fmtPercent(outputRatio) : '\u2014' },
    { label: t('analytics.contextGrowth'), value: s.messageCount > 0 ? `${fmtTokens(Math.round(contextGrowth))}/step` : '\u2014' },
  ];

  const productivityCards = [
    { label: t('analytics.linesPerHour'), value: durationHours > 0 && linesAdded > 0 ? fmtNum(Math.round(linesAdded / durationHours)) : '\u2014' },
    { label: t('analytics.costPerHour'), value: durationHours > 0 ? fmtUsd(cost / durationHours) : '\u2014' },
    { label: t('analytics.costPerCommit'), value: (s.commitStats?.commits ?? 0) > 0 ? fmtUsd(cost / s.commitStats!.commits) : '\u2014' },
    { label: t('analytics.netLines'), value: linesAdded > 0 || linesDeleted > 0 ? `+${fmtNum(linesAdded)} / -${fmtNum(linesDeleted)}` : '\u2014' },
    { label: t('analytics.metricFiles'), value: (s.commitStats?.filesChanged ?? 0) > 0 ? fmtNum(s.commitStats!.filesChanged) : '\u2014' },
    { label: t('analytics.metricDuration'), value: durationMs > 0 ? fmtDuration(durationMs) : '\u2014' },
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

const TOOL_COLORS = [
  '#1976d2', '#8b5cf6', '#00897b', '#e65100', '#c62828',
  '#6d4c41', '#37474f', '#f9a825', '#558b2f', '#ad1457',
  '#0097a7', '#5c6bc0', '#ef6c00', '#2e7d32', '#8e24aa',
] as const;

type SessionToolMetric = 'count' | 'tokens' | 'duration';

function SessionToolUsageChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [metric, setMetric] = useState<SessionToolMetric>('count');
  const usage = toolMetrics?.toolUsage;
  if (!usage || usage.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('analytics.toolUsageTitle')}</Typography>
        <Typography variant="body2" color="text.secondary">0</Typography>
      </Paper>
    );
  }

  const getValue = (e: { count: number; tokens: number; durationMs: number }): number =>
    metric === 'tokens' ? e.tokens
    : metric === 'duration' ? Math.round(e.durationMs / 1000)
    : e.count;

  const sorted = [...usage].sort((a, b) => getValue(b) - getValue(a));

  // 1行の積算横棒: Y軸=メトリクス名、各ツールが色分けでスタック
  const entry: Record<string, string | number> = { metric: metric === 'tokens' ? 'tokens' : metric === 'duration' ? 'sec' : 'count' };
  for (let i = 0; i < sorted.length; i++) {
    entry[`t${i}`] = getValue(sorted[i]);
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">{t('analytics.toolUsageTitle')}</Typography>
        <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, v: SessionToolMetric | null) => { if (v) setMetric(v); }}>
          <ToggleButton value="count">{t('behavior.toolCounts.count')}</ToggleButton>
          <ToggleButton value="tokens">{t('behavior.toolCounts.tokens')}</ToggleButton>
          <ToggleButton value="duration">{t('behavior.toolCounts.duration')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <BarChart
        dataset={[entry]}
        layout="horizontal"
        yAxis={[{ scaleType: 'band', dataKey: 'metric' }]}
        series={sorted.map((e, i) => ({
          dataKey: `t${i}`,
          label: e.tool,
          stack: 'total',
          color: TOOL_COLORS[i % TOOL_COLORS.length],
        }))}
        height={100}
        margin={{ left: 60, right: 16, top: 8, bottom: 24 }}
      />
    </Paper>
  );
}

function SessionSkillUsageChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [metric, setMetric] = useState<SessionToolMetric>('count');
  const usage = toolMetrics?.skillUsage;
  if (!usage || usage.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('behavior.sections.skills')}</Typography>
        <Typography variant="body2" color="text.secondary">0</Typography>
      </Paper>
    );
  }

  const getValue = (e: { count: number; tokens: number; durationMs: number }): number =>
    metric === 'tokens' ? e.tokens
    : metric === 'duration' ? Math.round(e.durationMs / 1000)
    : e.count;

  const sorted = [...usage].sort((a, b) => getValue(b) - getValue(a));

  const entry: Record<string, string | number> = { metric: metric === 'tokens' ? 'tokens' : metric === 'duration' ? 'sec' : 'count' };
  for (let i = 0; i < sorted.length; i++) {
    entry[`s${i}`] = getValue(sorted[i]);
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">{t('behavior.sections.skills')}</Typography>
        <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, v: SessionToolMetric | null) => { if (v) setMetric(v); }}>
          <ToggleButton value="count">{t('behavior.toolCounts.count')}</ToggleButton>
          <ToggleButton value="tokens">{t('behavior.toolCounts.tokens')}</ToggleButton>
          <ToggleButton value="duration">{t('behavior.toolCounts.duration')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <BarChart
        dataset={[entry]}
        layout="horizontal"
        yAxis={[{ scaleType: 'band', dataKey: 'metric' }]}
        series={sorted.map((e, i) => ({
          dataKey: `s${i}`,
          label: e.skill,
          stack: 'total',
          color: TOOL_COLORS[i % TOOL_COLORS.length],
        }))}
        height={100}
        margin={{ left: 60, right: 16, top: 8, bottom: 24 }}
      />
    </Paper>
  );
}

function SessionErrorChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const errors = toolMetrics?.errorsByTool;
  if (!errors || errors.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('behavior.sections.errors')}</Typography>
        <Typography variant="body2" color="text.secondary">0</Typography>
      </Paper>
    );
  }

  const sorted = [...errors].sort((a, b) => b.count - a.count);
  const entry: Record<string, string | number> = { metric: 'errors' };
  for (let i = 0; i < sorted.length; i++) {
    entry[`e${i}`] = sorted[i].count;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('behavior.sections.errors')}</Typography>
      <BarChart
        dataset={[entry]}
        layout="horizontal"
        yAxis={[{ scaleType: 'band', dataKey: 'metric' }]}
        series={sorted.map((e, i) => ({
          dataKey: `e${i}`,
          label: e.tool,
          stack: 'total',
          color: TOOL_COLORS[i % TOOL_COLORS.length],
        }))}
        height={100}
        margin={{ left: 60, right: 16, top: 8, bottom: 24 }}
      />
    </Paper>
  );
}

function DailySessionList({
  date,
  sessions,
  onSelectSession,
  onJumpToTrace,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
}: Readonly<{
  date: string;
  sessions: readonly TrailSession[];
  onSelectSession?: (id: string) => void;
  onJumpToTrace?: (session: TrailSession) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
}>) {
  const { colors, cardSx, scrollbarSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [timelineSessionId, setTimelineSessionId] = useState<string | null>(null);
  const [timelineMessages, setTimelineMessages] = useState<readonly TrailMessage[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [sessionToolMetrics, setSessionToolMetrics] = useState<ToolMetrics | null>(null);
  const daySessions = sessions.filter((s) => toLocalDateKey(s.startTime) === date);

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
          {date} — {daySessions.length} {daySessions.length !== 1 ? t('sessionList.sessions') : t('sessionList.session')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', lg: 'row' } }}>
        {/* Left: fixed height matches right column when session selected */}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', ...scrollbarSx, ...(timelineSessionId && daySessions.find((s) => s.id === timelineSessionId) ? { height: { lg: 726 } } : { maxHeight: { lg: 726 } }) }}>
          {daySessions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('sessionList.noSessionsFound')}</Typography>
          ) : (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { color: colors.textSecondary, borderColor: colors.border, bgcolor: colors.midnightNavy } }}>
                  <TableCell>{t('sessionList.timeHeader')}</TableCell>
                  <TableCell>{t('sessionList.modelHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.tokensHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.costHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.messagesHeader')}</TableCell>
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
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {s.model}
                    </TableCell>
                    <TableCell align="right">
                      {fmtTokens(s.usage.inputTokens + s.usage.outputTokens + s.usage.cacheReadTokens + s.usage.cacheCreationTokens)}
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

        {/* Right: cards + timeline — visible when a session is selected */}
        {timelineSessionId && daySessions.find((s) => s.id === timelineSessionId) && (
          <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1, width: { lg: 600 } }}>
            <SessionMetricsPanel
              session={daySessions.find((s) => s.id === timelineSessionId)!}
              toolMetrics={sessionToolMetrics}
            />
            <SessionToolUsageChart toolMetrics={sessionToolMetrics} />
            <SessionSkillUsageChart toolMetrics={sessionToolMetrics} />
            <SessionErrorChart toolMetrics={sessionToolMetrics} />
            {timelineLoading ? (
              <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5, height: 270, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">{t('sessionList.loadingTimeline')}</Typography>
              </Paper>
            ) : (
              <SessionCacheTimeline
                messages={timelineMessages}
              />
            )}
            {fetchSessionCommits && (
              <SessionCommitList
                sessionId={timelineSessionId}
                usage={daySessions.find((s) => s.id === timelineSessionId)?.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }}
                fetchSessionCommits={fetchSessionCommits}
              />
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
}

type ChartEntry = {
  date: string; fullDate: string;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
  actualCost: number; skillCost: number;
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
  const map = new Map<string, ChartEntry>();
  for (const d of entries) {
    const key = toFridayWeekKey(d.fullDate);
    const e = map.get(key) ?? { date: key.slice(5), fullDate: key, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, actualCost: 0, skillCost: 0 };
    e.inputTokens += d.inputTokens;
    e.outputTokens += d.outputTokens;
    e.cacheReadTokens += d.cacheReadTokens;
    e.cacheCreationTokens += d.cacheCreationTokens;
    e.actualCost += d.actualCost;
    e.skillCost += d.skillCost;
    map.set(key, e);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

function DailyActivityChart({
  items,
  sessions,
  period,
  setPeriod,
  onSelectSession,
  onJumpToTrace,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
  costOptimization,
}: Readonly<{
  items: AnalyticsData['dailyActivity'];
  sessions: readonly TrailSession[];
  period: PeriodDays;
  setPeriod: (v: PeriodDays) => void;
  onSelectSession?: (id: string) => void;
  onJumpToTrace?: (session: TrailSession) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  costOptimization?: CostOptimizationData | null;
}>) {
  const { colors, chartColors } = useTrailTheme();
  const { t } = useTrailI18n();
  const [mode, setMode] = useState<DailyViewMode>('tokens');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  if (items.length === 0) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - period);
  const cutoffStr = toLocalDateKey(cutoff.toISOString());
  const filtered = items.filter((d) => d.date >= cutoffStr);

  const isTokens = mode === 'tokens';

  // Build cost optimization lookup by date
  const costByDate = useMemo(() => {
    const map = new Map<string, { actual: number; skill: number }>();
    if (!costOptimization) return map;
    for (const d of costOptimization.daily) {
      map.set(d.date, { actual: d.actualCost, skill: d.skillCost });
    }
    return map;
  }, [costOptimization]);

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
    };
  });

  const dataset = period === 90 ? groupByWeek(dailyDataset) : dailyDataset;

  const yFormatter = isTokens ? fmtTokens : fmtUsd;

  const handleAxisClick = (_event: MouseEvent, data: { dataIndex: number } | null) => {
    const idx = data?.dataIndex;
    if (idx == null || idx < 0 || idx >= dataset.length) return;
    const fullDate = dataset[idx].fullDate;
    setSelectedDate((prev) => (prev === fullDate ? null : fullDate));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1">
            {isTokens ? t('chart.tokenUsage') : t('chart.estimatedCost')}
          </Typography>
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={(_e, v: PeriodDays | null) => { if (v) { setPeriod(v); setSelectedDate(null); } }}
            size="small"
          >
            <ToggleButton value={7} sx={{ color: colors.textSecondary, borderColor: colors.border, '&.Mui-selected': { color: colors.iceBlue, bgcolor: colors.iceBlueBg, borderColor: colors.iceBlue }, '&:hover': { bgcolor: colors.hoverBg } }}>7d</ToggleButton>
            <ToggleButton value={30} sx={{ color: colors.textSecondary, borderColor: colors.border, '&.Mui-selected': { color: colors.iceBlue, bgcolor: colors.iceBlueBg, borderColor: colors.iceBlue }, '&:hover': { bgcolor: colors.hoverBg } }}>30d</ToggleButton>
            {process.env.NEXT_PUBLIC_SHOW_UNLIMITED === '1' && (
              <ToggleButton value={90} sx={{ color: colors.textSecondary, borderColor: colors.border, '&.Mui-selected': { color: colors.iceBlue, bgcolor: colors.iceBlueBg, borderColor: colors.iceBlue }, '&:hover': { bgcolor: colors.hoverBg } }}>90d</ToggleButton>
            )}
          </ToggleButtonGroup>
        </Box>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_e, v: DailyViewMode | null) => { if (v) setMode(v); }}
          size="small"
        >
          <ToggleButton value="tokens" sx={{ color: colors.textSecondary, borderColor: colors.border, '&.Mui-selected': { color: colors.iceBlue, bgcolor: colors.iceBlueBg, borderColor: colors.iceBlue }, '&:hover': { bgcolor: colors.hoverBg } }}>{t('chart.tokens')}</ToggleButton>
          <ToggleButton value="cost" sx={{ color: colors.textSecondary, borderColor: colors.border, '&.Mui-selected': { color: colors.iceBlue, bgcolor: colors.iceBlueBg, borderColor: colors.iceBlue }, '&:hover': { bgcolor: colors.hoverBg } }}>{t('chart.cost')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'date' }]}
        yAxis={[{ valueFormatter: yFormatter }]}
        series={isTokens ? [
          { dataKey: 'inputTokens', label: 'Input', stack: 'a', color: chartColors.input },
          { dataKey: 'outputTokens', label: 'Output', stack: 'a', color: chartColors.output },
          { dataKey: 'cacheReadTokens', label: 'Cache Read', stack: 'a', color: chartColors.cacheRead },
          { dataKey: 'cacheCreationTokens', label: 'Cache Write', stack: 'a', color: chartColors.cacheWrite },
        ] : [
          { dataKey: 'actualCost', label: 'Current', color: '#1976d2' },
          { dataKey: 'skillCost', label: 'Optimized', color: '#8b5cf6' },
        ]}
        height={240}
        margin={{ left: 60, right: 16, top: 16, bottom: 24 }}
        slotProps={{
          legend: { direction: 'horizontal', position: { vertical: 'top', horizontal: 'end' } },
        }}
        onAxisClick={period === 90 ? undefined : handleAxisClick}
      />
      {selectedDate && period !== 90 && (
        <DailySessionList
          date={selectedDate}
          sessions={sessions}
          onSelectSession={onSelectSession}
          onJumpToTrace={onJumpToTrace}
          fetchSessionMessages={fetchSessionMessages}
          fetchSessionCommits={fetchSessionCommits}
          fetchSessionToolMetrics={fetchSessionToolMetrics}
        />
      )}
    </Box>
  );
}

function ModelTable({ items }: Readonly<{ items: AnalyticsData['modelBreakdown'] }>) {
  const { colors } = useTrailTheme();
  const { t } = useTrailI18n();
  if (items.length === 0) return null;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {t('analytics.modelBreakdown')}
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ '& .MuiTableCell-head': { color: colors.textSecondary, borderColor: colors.border } }}>
            <TableCell>Model</TableCell>
            <TableCell align="right">Sessions</TableCell>
            <TableCell align="right">Input Tokens</TableCell>
            <TableCell align="right">Output Tokens</TableCell>
            <TableCell align="right">Est. Cost</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.model} sx={{ '& .MuiTableCell-root': { borderColor: colors.border } }}>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {m.model}
              </TableCell>
              <TableCell align="right">{fmtNum(m.sessions)}</TableCell>
              <TableCell align="right">{fmtTokens(m.inputTokens)}</TableCell>
              <TableCell align="right">{fmtTokens(m.outputTokens)}</TableCell>
              <TableCell align="right">{fmtUsd(m.estimatedCostUsd)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}


// ---------------------------------------------------------------------------
//  Main component
// ---------------------------------------------------------------------------

// ─── Behavior charts in Analytics ───────────────────────────────────────────

const BEHAVIOR_PALETTE = [
  '#1976d2', '#8b5cf6', '#00897b', '#e65100', '#c62828',
  '#6d4c41', '#37474f', '#f9a825', '#558b2f', '#ad1457',
] as const;

type BehaviorMetric = 'count' | 'tokens' | 'duration';

function BehaviorChartsSection({ fetchBehaviorData, periodDays }: Readonly<{
  fetchBehaviorData: (period: BehaviorPeriodMode, rangeDays: BehaviorRangeDays) => Promise<BehaviorData>;
  periodDays: PeriodDays;
}>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [metric, setMetric] = useState<BehaviorMetric>('count');
  const [data, setData] = useState<BehaviorData | null>(null);

  // PeriodDays (7/30/90) → BehaviorRangeDays (30/90) + period に変換
  const rangeDays: BehaviorRangeDays = periodDays >= 90 ? 90 : 30;
  const period: BehaviorPeriodMode = periodDays >= 90 ? 'week' : 'day';

  const load = useCallback(async () => {
    const result = await fetchBehaviorData(period, rangeDays);
    setData(result);
  }, [fetchBehaviorData, period, rangeDays]);

  useEffect(() => { void load(); }, [load]);

  if (!data) return null;

  const getValue = (r: { count: number; tokens?: number; durationMs?: number }): number =>
    metric === 'tokens' ? (r.tokens ?? 0)
    : metric === 'duration' ? Math.round((r.durationMs ?? 0) / 1000)
    : r.count;

  // periodDays に合わせて表示期間をフィルタ
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const toolRows = (data.toolCounts ?? []).filter(r => r.period >= cutoffStr);
  const allPeriods = [...new Set(toolRows.map(r => r.period))].sort();
  const labels = allPeriods.map(p => p.length > 5 ? p.slice(5) : p);
  const tools = [...new Set(toolRows.map(r => r.tool))];

  // Tool Usage dataset
  const toolValMap = new Map<string, number>();
  for (const r of toolRows) {
    const v = getValue(r);
    toolValMap.set(`${r.period}::${r.tool}`, (toolValMap.get(`${r.period}::${r.tool}`) ?? 0) + v);
  }
  const toolDataset = allPeriods.map(p => {
    const entry: Record<string, string | number> = { period: labels[allPeriods.indexOf(p)] };
    for (let i = 0; i < tools.length; i++) {
      entry[`t${i}`] = toolValMap.get(`${p}::${tools[i]}`) ?? 0;
    }
    return entry;
  });

  // Error Patterns
  const errorRows = (data.errorRate ?? []).filter(r => r.period >= cutoffStr);
  const errByPeriod = new Map(errorRows.map(r => [r.period, r]));
  const errTools = [...new Set(errorRows.flatMap(r => Object.keys(r.byTool)))];
  const errDataset = allPeriods.map(p => {
    const entry: Record<string, string | number> = { period: labels[allPeriods.indexOf(p)] };
    for (let i = 0; i < errTools.length; i++) {
      entry[`e${i}`] = errByPeriod.get(p)?.byTool[errTools[i]] ?? 0;
    }
    return entry;
  });

  // Skill Analysis
  const skillRows = (data.skillStats ?? []).filter(r => r.period >= cutoffStr);
  const skills = [...new Set(skillRows.map(r => r.skill))];
  const skillCountMap = new Map<string, number>();
  for (const r of skillRows) {
    skillCountMap.set(`${r.period}::${r.skill}`, (skillCountMap.get(`${r.period}::${r.skill}`) ?? 0) + r.count);
  }
  const skillDataset = allPeriods.map(p => {
    const entry: Record<string, string | number> = { period: labels[allPeriods.indexOf(p)] };
    for (let i = 0; i < skills.length; i++) {
      entry[`s${i}`] = skillCountMap.get(`${p}::${skills[i]}`) ?? 0;
    }
    return entry;
  });

  const controls = (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, v: BehaviorMetric | null) => { if (v) setMetric(v); }}>
        <ToggleButton value="count">{t('behavior.toolCounts.count')}</ToggleButton>
        <ToggleButton value="tokens">{t('behavior.toolCounts.tokens')}</ToggleButton>
        <ToggleButton value="duration">{t('behavior.toolCounts.duration')}</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );

  return (
    <>
      {controls}
      {toolRows.length > 0 && (
        <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.toolCounts')}</Typography>
          <BarChart
            dataset={toolDataset}
            xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
            series={tools.map((tool, i) => ({
              dataKey: `t${i}`,
              label: tool,
              stack: 'total',
              color: BEHAVIOR_PALETTE[i % BEHAVIOR_PALETTE.length],
            }))}
            height={220}
            margin={{ left: 8, right: 8, top: 8, bottom: 60 }}
          />
        </Paper>
      )}
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.errors')}</Typography>
        {errTools.length === 0 ? (
          <Typography variant="body2" color="text.secondary">0</Typography>
        ) : (
          <BarChart
            dataset={errDataset}
            xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
            series={errTools.map((tool, i) => ({
              dataKey: `e${i}`,
              label: tool,
              stack: 'total',
              color: BEHAVIOR_PALETTE[i % BEHAVIOR_PALETTE.length],
            }))}
            height={200}
            margin={{ left: 40, right: 8, top: 8, bottom: 40 }}
          />
        )}
      </Paper>
      {skills.length > 0 && (
        <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.skills')}</Typography>
          <BarChart
            dataset={skillDataset}
            xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
            series={skills.map((skill, i) => ({
              dataKey: `s${i}`,
              label: skill,
              stack: 'total',
              color: BEHAVIOR_PALETTE[i % BEHAVIOR_PALETTE.length],
            }))}
            height={200}
            margin={{ left: 40, right: 8, top: 8, bottom: 40 }}
          />
        </Paper>
      )}
    </>
  );
}

export function AnalyticsPanel({ analytics, sessions = [], onSelectSession, onJumpToTrace, fetchSessionMessages, fetchSessionCommits, fetchSessionToolMetrics, costOptimization, fetchBehaviorData }: Readonly<AnalyticsPanelProps>) {
  const { colors } = useTrailTheme();
  const { t } = useTrailI18n();
  const [period, setPeriod] = useState<PeriodDays>(30);

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
    <Box sx={{ overflow: 'auto', flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <OverviewCards totals={analytics.totals} sessions={sessions} />
      <ToolUsageChart items={analytics.toolUsage} />
      <DailyActivityChart items={analytics.dailyActivity} sessions={sessions} period={period} setPeriod={setPeriod} onSelectSession={onSelectSession} onJumpToTrace={onJumpToTrace} fetchSessionMessages={fetchSessionMessages} fetchSessionCommits={fetchSessionCommits} fetchSessionToolMetrics={fetchSessionToolMetrics} costOptimization={costOptimization} />
      <ModelTable items={analytics.modelBreakdown} />
      {fetchBehaviorData && <BehaviorChartsSection fetchBehaviorData={fetchBehaviorData} periodDays={period} />}
    </Box>
  );
}
