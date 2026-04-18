import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { SxProps, Theme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { formatLocalTime, toLocalDateKey } from '@anytime-markdown/trail-core/formatDate';
import type { AnalyticsData, CombinedData, CombinedPeriodMode, CombinedRangeDays, CostOptimizationData, ToolMetrics, TrailMessage, TrailSession, TrailSessionCommit, TrailTokenUsage } from '../parser/types';
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
          margin={{ left: 16, right: 16, top: 16, bottom: 0 }}
          slotProps={{
            legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } },
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

type SessionToolMetric = 'count' | 'tokens' | 'duration';

function SessionModelUsageChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const [metric, setMetric] = useState<SessionToolMetric>('count');
  const usage = toolMetrics?.modelUsage;
  if (!usage || usage.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 2, pr: 2, pb: 0, pl: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('analytics.combined.model')}</Typography>
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
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const v = getValue(sorted[i]);
    entry[`m${i}`] = v;
    total += v;
  }
  const tickValues = niceTicks(total);

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 2, pr: 2, pb: 0, pl: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, px: 2 }}>
        <Typography variant="subtitle2">{t('analytics.combined.model')}</Typography>
        <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, v: SessionToolMetric | null) => { if (v) setMetric(v); }}>
          <ToggleButton value="count">{t('analytics.combined.count')}</ToggleButton>
          <ToggleButton value="tokens">{t('analytics.combined.tokens')}</ToggleButton>
          <ToggleButton value="duration">{t('analytics.combined.duration')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <BarChart
        dataset={[entry]}
        layout="horizontal"
        yAxis={[{ scaleType: 'band', dataKey: 'metric', categoryGapRatio: 0.25, tickLabelStyle: { display: 'none' } }]}
        xAxis={[{ tickInterval: tickValues, valueFormatter: metric === 'duration' ? fmtDurationShort : fmtTokens }]}
        series={sorted.map((e, i) => ({
          dataKey: `m${i}`,
          label: e.model,
          stack: 'total',
          color: toolPalette[i % toolPalette.length],
        }))}
        height={70}
        margin={{ left: 20, right: 16, top: 4, bottom: 16 }}
        slots={{ legend: () => null }}
      />
    </Paper>
  );
}

function SessionToolUsageChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const [metric, setMetric] = useState<SessionToolMetric>('count');
  const usage = toolMetrics?.toolUsage;
  if (!usage || usage.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 2, pr: 2, pb: 0, pl: 2 }}>
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
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const v = getValue(sorted[i]);
    entry[`t${i}`] = v;
    total += v;
  }
  const tickValues = niceTicks(total);

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 2, pr: 2, pb: 0, pl: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, px: 2 }}>
        <Typography variant="subtitle2">{t('analytics.toolUsageTitle')}</Typography>
        <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, v: SessionToolMetric | null) => { if (v) setMetric(v); }}>
          <ToggleButton value="count">{t('analytics.combined.count')}</ToggleButton>
          <ToggleButton value="tokens">{t('analytics.combined.tokens')}</ToggleButton>
          <ToggleButton value="duration">{t('analytics.combined.duration')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <BarChart
        dataset={[entry]}
        layout="horizontal"
        yAxis={[{ scaleType: 'band', dataKey: 'metric', categoryGapRatio: 0.25, tickLabelStyle: { display: 'none' } }]}
        xAxis={[{ tickInterval: tickValues, valueFormatter: metric === 'duration' ? fmtDurationShort : fmtTokens }]}
        series={sorted.map((e, i) => ({
          dataKey: `t${i}`,
          label: e.tool,
          stack: 'total',
          color: toolPalette[i % toolPalette.length],
        }))}
        height={70}
        margin={{ left: 20, right: 16, top: 4, bottom: 16 }}
        slots={{ legend: () => null }}
      />
    </Paper>
  );
}

function SessionSkillUsageChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const [metric, setMetric] = useState<SessionToolMetric>('count');
  const usage = toolMetrics?.skillUsage;
  if (!usage || usage.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 2, pr: 2, pb: 0, pl: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('analytics.combined.skill')}</Typography>
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
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const v = getValue(sorted[i]);
    entry[`s${i}`] = v;
    total += v;
  }
  const tickValues = niceTicks(total);

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 2, pr: 2, pb: 0, pl: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, px: 2 }}>
        <Typography variant="subtitle2">{t('analytics.combined.skill')}</Typography>
        <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, v: SessionToolMetric | null) => { if (v) setMetric(v); }}>
          <ToggleButton value="count">{t('analytics.combined.count')}</ToggleButton>
          <ToggleButton value="tokens">{t('analytics.combined.tokens')}</ToggleButton>
          <ToggleButton value="duration">{t('analytics.combined.duration')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <BarChart
        dataset={[entry]}
        layout="horizontal"
        yAxis={[{ scaleType: 'band', dataKey: 'metric', categoryGapRatio: 0.25, tickLabelStyle: { display: 'none' } }]}
        xAxis={[{ tickInterval: tickValues, valueFormatter: metric === 'duration' ? fmtDurationShort : fmtTokens }]}
        series={sorted.map((e, i) => ({
          dataKey: `s${i}`,
          label: e.skill,
          stack: 'total',
          color: toolPalette[i % toolPalette.length],
        }))}
        height={70}
        margin={{ left: 20, right: 16, top: 4, bottom: 16 }}
        slots={{ legend: () => null }}
      />
    </Paper>
  );
}

function SessionErrorChart({ toolMetrics }: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const errors = toolMetrics?.errorsByTool;
  if (!errors || errors.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, pt: 2, pr: 2, pb: 0, pl: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('analytics.combined.error')}</Typography>
        <Typography variant="body2" color="text.secondary">0</Typography>
      </Paper>
    );
  }

  const sorted = [...errors].sort((a, b) => b.count - a.count);
  const entry: Record<string, string | number> = { metric: 'errors' };
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    entry[`e${i}`] = sorted[i].count;
    total += sorted[i].count;
  }
  const tickValues = niceTicks(total);

  return (
    <Paper elevation={0} sx={{ ...cardSx, pt: 2, pr: 2, pb: 0, pl: 0 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, px: 2 }}>{t('analytics.combined.error')}</Typography>
      <BarChart
        dataset={[entry]}
        layout="horizontal"
        yAxis={[{ scaleType: 'band', dataKey: 'metric', categoryGapRatio: 0.25, tickLabelStyle: { display: 'none' } }]}
        xAxis={[{ tickInterval: tickValues, valueFormatter: fmtTokens }]}
        series={sorted.map((e, i) => ({
          dataKey: `e${i}`,
          label: e.tool,
          stack: 'total',
          color: toolPalette[i % toolPalette.length],
        }))}
        height={70}
        margin={{ left: 20, right: 16, top: 4, bottom: 16 }}
        slots={{ legend: () => null }}
      />
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
  onSelectSession,
  onJumpToTrace,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
  fetchDayToolMetrics,
}: Readonly<{
  date: string;
  sessions: readonly TrailSession[];
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
          {date} — {daySessions.length} {daySessions.length !== 1 ? t('sessionList.sessions') : t('sessionList.session')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', lg: 'row' } }}>
        {/* Left: fixed height matches right column when session selected */}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', ...scrollbarSx, ...(daySessions.length > 0 ? { height: { lg: 726 } } : { maxHeight: { lg: 726 } }) }}>
          {daySessions.length === 0 ? (
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
                <SessionModelUsageChart toolMetrics={sessionToolMetrics} />
                <SessionSkillUsageChart toolMetrics={sessionToolMetrics} />
                <SessionToolUsageChart toolMetrics={sessionToolMetrics} />
                <SessionErrorChart toolMetrics={sessionToolMetrics} />
                {timelineLoading ? (
                  <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5, height: 270, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body2" color="text.secondary">{t('sessionList.loadingTimeline')}</Typography>
                  </Paper>
                ) : (
                  <SessionCacheTimeline messages={timelineMessages} />
                )}
                {fetchSessionCommits && (
                  <SessionCommitList
                    sessionId={timelineSessionId!}
                    usage={selectedSession.usage}
                    fetchSessionCommits={fetchSessionCommits}
                  />
                )}
              </Box>
            );
          }
          return (
            <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1, width: { lg: 600 } }}>
              <SessionMetricsPanel session={buildDaySession(date, daySessions)} toolMetrics={dayAggToolMetrics} />
              <SessionModelUsageChart toolMetrics={dayAggToolMetrics} />
              <SessionSkillUsageChart toolMetrics={dayAggToolMetrics} />
              <SessionToolUsageChart toolMetrics={dayAggToolMetrics} />
              <SessionErrorChart toolMetrics={dayAggToolMetrics} />
              <SessionCacheTimeline messages={[]} />
            </Box>
          );
        })()}
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
  period,
  mode,
  onDateClick,
  costOptimization,
}: Readonly<{
  items: AnalyticsData['dailyActivity'];
  period: PeriodDays;
  mode: DailyViewMode;
  onDateClick?: (fullDate: string) => void;
  costOptimization?: CostOptimizationData | null;
}>) {
  const { chartColors, cardSx } = useTrailTheme();

  const costByDate = useMemo(() => {
    const map = new Map<string, { actual: number; skill: number }>();
    if (!costOptimization) return map;
    for (const d of costOptimization.daily) {
      map.set(d.date, { actual: d.actualCost, skill: d.skillCost });
    }
    return map;
  }, [costOptimization]);

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
      };
    });
    return period === 90 ? groupByWeek(dailyDataset) : dailyDataset;
  }, [items, period, mode, costByDate]);

  if (items.length === 0) return null;

  const isTokens = mode === 'tokens';
  const yFormatter = isTokens ? fmtTokens : fmtUsdShort;
  const seriesFormatter = (v: number | null) => (v == null || v === 0 ? null : yFormatter(v));

  const handleAxisClick = (_event: MouseEvent, data: { dataIndex: number } | null) => {
    const idx = data?.dataIndex;
    if (idx == null || idx < 0 || idx >= dataset.length) return;
    onDateClick?.(dataset[idx].fullDate);
  };

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'date' }]}
        yAxis={[{ valueFormatter: yFormatter }]}
        series={isTokens ? [
          { dataKey: 'inputTokens', label: 'Input', stack: 'a', color: chartColors.input, valueFormatter: seriesFormatter },
          { dataKey: 'outputTokens', label: 'Output', stack: 'a', color: chartColors.output, valueFormatter: seriesFormatter },
          { dataKey: 'cacheReadTokens', label: 'Cache Read', stack: 'a', color: chartColors.cacheRead, valueFormatter: seriesFormatter },
          { dataKey: 'cacheCreationTokens', label: 'Cache Write', stack: 'a', color: chartColors.cacheWrite, valueFormatter: seriesFormatter },
        ] : [
          { dataKey: 'actualCost', label: 'Current', color: chartColors.primary, valueFormatter: seriesFormatter },
          { dataKey: 'skillCost', label: 'Optimized', color: chartColors.skill, valueFormatter: seriesFormatter },
        ]}
        height={240}
        margin={{ left: 16, right: 8, top: 8, bottom: 40 }}
        slotProps={{
          legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } },
        }}
        onAxisClick={period === 90 ? undefined : handleAxisClick}
      />
    </Paper>
  );
}



// ---------------------------------------------------------------------------
//  Main component
// ---------------------------------------------------------------------------

// ─── Behavior charts in Analytics ───────────────────────────────────────────

type ChartMetric = 'count' | 'tokens';
type CombinedChartKind = 'tools' | 'errors' | 'skills' | 'models';

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

function CombinedChartsContent({ data, periodDays, activeChart, toolMetric, modelMetric, onDateClick }: Readonly<{
  data: CombinedData | null;
  periodDays: PeriodDays;
  activeChart: CombinedChartKind;
  toolMetric: ChartMetric;
  modelMetric: ChartMetric;
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
    const allPeriods = [...new Set(toolRows.map(r => r.period))].sort();
    const labels = allPeriods.map(p => p.length > 5 ? p.slice(5) : p);
    const modelPeriods = [...new Set(modelRows.map(r => r.period))].sort();
    const modelLabels = modelPeriods.map(p => p.length > 5 ? p.slice(5) : p);

    const toolTotals = new Map<string, number>();
    for (const r of toolRows) toolTotals.set(r.tool, (toolTotals.get(r.tool) ?? 0) + r.count);
    const errToolTotals = new Map<string, number>();
    for (const r of errorRows) for (const [k, v] of Object.entries(r.byTool)) errToolTotals.set(k, (errToolTotals.get(k) ?? 0) + v);
    const skillTotals = new Map<string, number>();
    for (const r of skillRows) skillTotals.set(r.skill, (skillTotals.get(r.skill) ?? 0) + r.count);
    const modelTotals = new Map<string, number>();
    for (const r of modelRows) modelTotals.set(r.model, (modelTotals.get(r.model) ?? 0) + r.count);

    const toolCap = capTopN(toolTotals);
    const errCap = capTopN(errToolTotals);
    const skillCap = capTopN(skillTotals);
    const modelCap = capTopN(modelTotals);

    return {
      toolRows,
      errorRows,
      skillRows,
      modelRows,
      allPeriods,
      labels,
      modelPeriods,
      modelLabels,
      tools: toolCap.displayKeys,
      toolMap: toolCap.keyMap,
      errTools: errCap.displayKeys,
      errMap: errCap.keyMap,
      skills: skillCap.displayKeys,
      skillMap: skillCap.keyMap,
      models: modelCap.displayKeys,
      modelMap: modelCap.keyMap,
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
  const { toolRows, errTools, tools, skills, models, allPeriods, modelPeriods } = axisInfo;
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

type CombinedMetric = 'tokens' | 'tools' | 'errors' | 'skills' | 'models';

function CombinedChartsSection({
  dailyActivity,
  sessions,
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
}: Readonly<{
  dailyActivity: AnalyticsData['dailyActivity'];
  sessions: readonly TrailSession[];
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
}>) {
  const { colors } = useTrailTheme();
  const { t } = useTrailI18n();
  const [metric, setMetric] = useState<CombinedMetric>('tokens');
  const [tokenMode, setTokenMode] = useState<DailyViewMode>('tokens');
  const [toolMetric, setToolMetric] = useState<ChartMetric>('count');
  const [modelMetric, setModelMetric] = useState<ChartMetric>('count');
  const [combinedData, setCombinedData] = useState<CombinedData | null>(null);
  const [combinedLoading, setCombinedLoading] = useState(false);
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
      </Box>
      {metric === 'tokens' ? (
        <DailyActivityChart
          items={dailyActivity}
          period={period}
          mode={tokenMode}
          onDateClick={handleDateClick}
          costOptimization={costOptimization}
        />
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
            onDateClick={handleDateClick}
          />
        )
      ) : null}
      {selectedDate && period !== 90 && (
        <DailySessionList
          date={selectedDate}
          sessions={sessions}
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

export function AnalyticsPanel({ analytics, sessions = [], onSelectSession, onJumpToTrace, fetchSessionMessages, fetchSessionCommits, fetchSessionToolMetrics, fetchDayToolMetrics, costOptimization, fetchCombinedData }: Readonly<AnalyticsPanelProps>) {
  const { t } = useTrailI18n();
  const { scrollbarSx } = useTrailTheme();
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
    <Box sx={{ overflow: 'auto', flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 3, ...scrollbarSx }}>
      <OverviewCards totals={analytics.totals} sessions={sessions} />
      <ToolUsageChart items={analytics.toolUsage} />
      <CombinedChartsSection
        dailyActivity={analytics.dailyActivity}
        sessions={sessions}
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
      />
    </Box>
  );
}
