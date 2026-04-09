import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import type { TrailMessage, TrailSession, TrailSessionCommit, TrailTokenUsage } from '../parser/types';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface AnalyticsData {
  readonly totals: {
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
    readonly estimatedCostUsd: number;
    readonly totalCommits: number;
    readonly totalLinesAdded: number;
    readonly totalLinesDeleted: number;
    readonly totalFilesChanged: number;
    readonly totalAiAssistedCommits: number;
    readonly totalSessionDurationMs: number;
  };
  readonly toolUsage: readonly { name: string; count: number }[];
  readonly modelBreakdown: readonly {
    readonly model: string;
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly estimatedCostUsd: number;
  }[];
  readonly dailyActivity: readonly {
    readonly date: string;
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
  }[];
  readonly branchBreakdown: readonly {
    readonly branch: string;
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
  }[];
}

export interface AnalyticsPanelProps {
  readonly analytics: AnalyticsData | null;
  readonly isDark?: boolean;
  readonly sessions?: readonly TrailSession[];
  readonly onSelectSession?: (id: string) => void;
  readonly fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  readonly fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
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
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const BAR_COLOR_PRIMARY = '#1976d2';
const BAR_COLOR_INPUT = '#42a5f5';
const BAR_COLOR_OUTPUT = '#ef5350';
const BAR_COLOR_CACHE_READ = '#66bb6a';
const BAR_COLOR_CACHE_WRITE = '#ffa726';

/** Estimated cost rates per 1M tokens (USD). Uses Sonnet as default. */
const COST_PER_M: Readonly<Record<string, number>> = {
  inputTokens: 3,
  outputTokens: 15,
  cacheReadTokens: 0.3,
  cacheCreationTokens: 3.75,
};

type DailyViewMode = 'tokens' | 'cost';
type PeriodDays = 7 | 30 | 90;

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------

function OverviewCards({
  totals,
  sessions = [],
}: Readonly<{
  totals: AnalyticsData['totals'];
  sessions?: readonly TrailSession[];
}>) {
  const totalInput = totals.inputTokens + totals.cacheReadTokens;
  const cacheHitRate = totalInput > 0
    ? fmtPercent(totals.cacheReadTokens / totalInput)
    : '\u2014';

  const cards = [
    { label: 'Total Sessions', value: fmtNum(totals.sessions) },
    { label: 'Total Tokens', value: fmtTokens(totals.inputTokens + totals.outputTokens) },
    { label: 'Estimated Cost', value: fmtUsd(totals.estimatedCostUsd) },
    { label: 'Cache Hit Rate', value: cacheHitRate },
  ];

  const totalTokens = totals.inputTokens + totals.outputTokens;
  const hasLines = totals.totalLinesAdded > 0;
  const commitCards = [
    { label: 'Total Commits', value: fmtNum(totals.totalCommits) },
    { label: 'Lines Added', value: fmtNum(totals.totalLinesAdded) },
    { label: 'Tokens/Line', value: hasLines
        ? fmtTokens(Math.round(totalTokens / totals.totalLinesAdded))
        : '\u2014' },
    { label: 'Cost/Line', value: hasLines
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
    { label: 'AI Commit %', value: totals.totalCommits > 0
        ? fmtPercent(totals.totalAiAssistedCommits / totals.totalCommits)
        : '\u2014' },
    { label: 'Avg Lines/Hour', value: totalDurationHours > 0 && totals.totalLinesAdded > 0
        ? fmtNum(Math.round(totals.totalLinesAdded / totalDurationHours))
        : '\u2014' },
    { label: 'Avg Cost/Hour', value: totalDurationHours > 0
        ? fmtUsd(totals.estimatedCostUsd / totalDurationHours)
        : '\u2014' },
    { label: 'Avg Context Growth', value: avgContextGrowth > 0
        ? `${fmtTokens(Math.round(avgContextGrowth))}/step`
        : '\u2014' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {cards.map((c) => (
          <Paper
            key={c.label}
            variant="outlined"
            sx={{ flex: '1 1 140px', p: 2, minWidth: 140, textAlign: 'center' }}
          >
            <Typography variant="caption" color="text.secondary">
              {c.label}
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }}>
              {c.value}
            </Typography>
          </Paper>
        ))}
      </Box>
      {totals.totalCommits > 0 && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {commitCards.map((c) => (
            <Paper
              key={c.label}
              variant="outlined"
              sx={{ flex: '1 1 140px', p: 2, minWidth: 140, textAlign: 'center' }}
            >
              <Typography variant="caption" color="text.secondary">
                {c.label}
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5 }}>
                {c.value}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
      {totals.totalCommits > 0 && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {efficiencyCards.map((c) => (
            <Paper
              key={c.label}
              variant="outlined"
              sx={{ flex: '1 1 140px', p: 2, minWidth: 140, textAlign: 'center' }}
            >
              <Typography variant="caption" color="text.secondary">
                {c.label}
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5 }}>
                {c.value}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}

function ToolUsageChart({ items }: Readonly<{ items: AnalyticsData['toolUsage'] }>) {
  if (items.length === 0) return null;
  const maxCount = items[0].count;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Tool Usage
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
              bgcolor: BAR_COLOR_PRIMARY,
              borderRadius: 0.5,
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

function toUsd(tokens: number, key: string): number {
  return (tokens * (COST_PER_M[key] ?? 3)) / 1_000_000;
}

function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function fmtPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}

function sessionCost(s: TrailSession): number {
  return toUsd(s.usage.inputTokens, 'inputTokens')
    + toUsd(s.usage.outputTokens, 'outputTokens')
    + toUsd(s.usage.cacheReadTokens, 'cacheReadTokens')
    + toUsd(s.usage.cacheCreationTokens, 'cacheCreationTokens');
}

function SessionCacheTimeline({
  messages,
  onClose,
}: Readonly<{
  messages: readonly TrailMessage[];
  onClose: () => void;
}>) {
  const assistantMsgs = messages.filter((m) => m.type === 'assistant' && m.usage);
  if (assistantMsgs.length === 0) {
    return (
      <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
        <Typography variant="body2" color="text.secondary">No token usage data in this session.</Typography>
      </Paper>
    );
  }

  const dataset = assistantMsgs.map((m, i) => ({
    turn: i + 1,
    inputTokens: m.usage?.inputTokens ?? 0,
    outputTokens: m.usage?.outputTokens ?? 0,
    cacheReadTokens: m.usage?.cacheReadTokens ?? 0,
    cacheCreationTokens: m.usage?.cacheCreationTokens ?? 0,
  }));

  return (
    <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">
          Session Cache Timeline ({assistantMsgs.length} turns)
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
          onClick={onClose}
        >
          Close
        </Typography>
      </Box>
      <LineChart
        dataset={dataset}
        xAxis={[{ dataKey: 'turn', label: 'Turn', scaleType: 'point' }]}
        yAxis={[{ valueFormatter: fmtTokens }]}
        series={[
          { dataKey: 'inputTokens', label: 'Input', color: BAR_COLOR_INPUT, showMark: false },
          { dataKey: 'outputTokens', label: 'Output', color: BAR_COLOR_OUTPUT, showMark: false },
          { dataKey: 'cacheReadTokens', label: 'Cache Read', color: BAR_COLOR_CACHE_READ, showMark: false },
          { dataKey: 'cacheCreationTokens', label: 'Cache Write', color: BAR_COLOR_CACHE_WRITE, showMark: false },
        ]}
        height={200}
        margin={{ left: 60, right: 16, top: 16, bottom: 32 }}
        slotProps={{
          legend: { direction: 'horizontal', position: { vertical: 'top', horizontal: 'end' } },
        }}
      />
    </Paper>
  );
}

function SessionCommitList({
  sessionId,
  usage,
  fetchSessionCommits,
  onClose,
}: Readonly<{
  sessionId: string;
  usage: TrailTokenUsage;
  fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
  onClose: () => void;
}>) {
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
      <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
        <Typography variant="body2" color="text.secondary">Loading commits...</Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">
          Related Commits ({commits.length})
        </Typography>
        <Typography
          variant="caption" color="text.secondary"
          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
          onClick={onClose}
        >
          Close
        </Typography>
      </Box>
      {commits.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No commits found in this session&apos;s time range
        </Typography>
      ) : (
        <>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Hash</TableCell>
                <TableCell>Message</TableCell>
                <TableCell align="right">Files</TableCell>
                <TableCell align="right">+/-</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {commits.map((c) => (
                <TableRow key={c.commitHash}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {c.commitHash.slice(0, 8)}
                    {c.isAiAssisted && (
                      <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'info.main' }}>
                        AI
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
          {totalAdded > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Tokens/Line: {fmtTokens(tokensPerLine)}
            </Typography>
          )}
        </>
      )}
    </Paper>
  );
}

function SessionMetricsPanel({ session }: Readonly<{ session: TrailSession }>) {
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

  const metrics = [
    { label: 'Tokens/Step', value: s.messageCount > 0 ? fmtTokens(Math.round(totalTokens / s.messageCount)) : '\u2014' },
    { label: 'Cost/Step', value: s.messageCount > 0 ? fmtUsd(cost / s.messageCount) : '\u2014' },
    { label: 'Lines/Hour', value: durationHours > 0 && linesAdded > 0 ? fmtNum(Math.round(linesAdded / durationHours)) : '\u2014' },
    { label: 'Cost/Hour', value: durationHours > 0 ? fmtUsd(cost / durationHours) : '\u2014' },
    { label: 'Cost/Commit', value: (s.commitStats?.commits ?? 0) > 0 ? fmtUsd(cost / s.commitStats!.commits) : '\u2014' },
    { label: 'Cache Hit', value: cacheInput > 0 ? fmtPercent(cacheHitRate) : '\u2014' },
    { label: 'Output Ratio', value: cacheInput > 0 ? fmtPercent(outputRatio) : '\u2014' },
    { label: 'Context Growth', value: s.messageCount > 0 ? `${fmtTokens(Math.round(contextGrowth))}/step` : '\u2014' },
    { label: 'Net Lines', value: linesAdded > 0 || linesDeleted > 0 ? `+${fmtNum(linesAdded)} / -${fmtNum(linesDeleted)}` : '\u2014' },
    { label: 'Files', value: (s.commitStats?.filesChanged ?? 0) > 0 ? fmtNum(s.commitStats!.filesChanged) : '\u2014' },
    { label: 'Duration', value: durationMs > 0 ? fmtDuration(durationMs) : '\u2014' },
    { label: 'Avg Interval', value: s.messageCount > 1 ? fmtDuration(durationMs / (s.messageCount - 1)) : '\u2014' },
  ];

  return (
    <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Session Metrics</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
        {metrics.map((m) => (
          <Box key={m.label} sx={{ textAlign: 'center', p: 0.5 }}>
            <Typography variant="caption" color="text.secondary">{m.label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>{m.value}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function DailySessionList({
  date,
  sessions,
  onSelectSession,
  fetchSessionMessages,
  fetchSessionCommits,
  onClose,
}: Readonly<{
  date: string;
  sessions: readonly TrailSession[];
  onSelectSession?: (id: string) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  onClose: () => void;
}>) {
  const [timelineSessionId, setTimelineSessionId] = useState<string | null>(null);
  const [timelineMessages, setTimelineMessages] = useState<readonly TrailMessage[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const daySessions = sessions.filter((s) => s.startTime.startsWith(date));

  const handleSessionClick = (id: string) => {
    if (timelineSessionId === id) {
      setTimelineSessionId(null);
      setTimelineMessages([]);
      return;
    }
    if (fetchSessionMessages) {
      setTimelineSessionId(id);
      setTimelineLoading(true);
      void fetchSessionMessages(id).then((msgs) => {
        setTimelineMessages(msgs);
        setTimelineLoading(false);
      });
    } else {
      onSelectSession?.(id);
    }
  };

  return (
    <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">
          {date} — {daySessions.length} session{daySessions.length !== 1 ? 's' : ''}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
          onClick={onClose}
        >
          Close
        </Typography>
      </Box>
      {daySessions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No sessions found.</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Model</TableCell>
              <TableCell align="right">Tokens</TableCell>
              <TableCell align="right">Cost</TableCell>
              <TableCell align="right">Messages</TableCell>
              <TableCell align="right">Commits(+/-)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {daySessions.map((s) => (
              <TableRow
                key={s.id}
                hover
                selected={timelineSessionId === s.id}
                sx={{ cursor: 'pointer' }}
                onClick={() => handleSessionClick(s.id)}
              >
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {s.startTime.slice(11, 16)}–{s.endTime.slice(11, 16)}
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {s.model}
                </TableCell>
                <TableCell align="right">
                  {fmtTokens(s.usage.inputTokens + s.usage.outputTokens)}
                </TableCell>
                <TableCell align="right">
                  {fmtUsd(
                    toUsd(s.usage.inputTokens, 'inputTokens')
                    + toUsd(s.usage.outputTokens, 'outputTokens')
                    + toUsd(s.usage.cacheReadTokens, 'cacheReadTokens')
                    + toUsd(s.usage.cacheCreationTokens, 'cacheCreationTokens')
                  )}
                </TableCell>
                <TableCell align="right">{fmtNum(s.messageCount)}</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {s.commitStats
                    ? `${s.commitStats.commits} (+${fmtNum(s.commitStats.linesAdded)}/-${fmtNum(s.commitStats.linesDeleted)})`
                    : '\u2014'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {timelineLoading && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Loading timeline...</Typography>
      )}
      {timelineSessionId && daySessions.find((s) => s.id === timelineSessionId) && (
        <SessionMetricsPanel
          session={daySessions.find((s) => s.id === timelineSessionId)!}
        />
      )}
      {timelineSessionId && timelineMessages.length > 0 && (
        <SessionCacheTimeline
          messages={timelineMessages}
          onClose={() => { setTimelineSessionId(null); setTimelineMessages([]); }}
        />
      )}
      {timelineSessionId && fetchSessionCommits && (
        <SessionCommitList
          sessionId={timelineSessionId}
          usage={daySessions.find((s) => s.id === timelineSessionId)?.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }}
          fetchSessionCommits={fetchSessionCommits}
          onClose={() => { setTimelineSessionId(null); setTimelineMessages([]); }}
        />
      )}
    </Paper>
  );
}

function DailyActivityChart({
  items,
  sessions,
  onSelectSession,
  fetchSessionMessages,
  fetchSessionCommits,
}: Readonly<{
  items: AnalyticsData['dailyActivity'];
  sessions: readonly TrailSession[];
  onSelectSession?: (id: string) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
}>) {
  const [mode, setMode] = useState<DailyViewMode>('tokens');
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  if (items.length === 0) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - period);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = items.filter((d) => d.date >= cutoffStr);

  const isTokens = mode === 'tokens';

  const dataset = filtered.map((d) => ({
    date: d.date.slice(5),
    fullDate: d.date,
    inputTokens: isTokens ? d.inputTokens : toUsd(d.inputTokens, 'inputTokens'),
    outputTokens: isTokens ? d.outputTokens : toUsd(d.outputTokens, 'outputTokens'),
    cacheReadTokens: isTokens ? d.cacheReadTokens : toUsd(d.cacheReadTokens, 'cacheReadTokens'),
    cacheCreationTokens: isTokens ? d.cacheCreationTokens : toUsd(d.cacheCreationTokens, 'cacheCreationTokens'),
  }));

  const yFormatter = isTokens ? fmtTokens : fmtUsd;

  const handleBarClick = (_event: unknown, params: { dataIndex?: number } | null) => {
    const idx = params?.dataIndex;
    if (idx == null || idx < 0 || idx >= dataset.length) return;
    const fullDate = dataset[idx].fullDate;
    setSelectedDate((prev) => (prev === fullDate ? null : fullDate));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1">
            {isTokens ? 'Token Usage' : 'Estimated Cost'}
          </Typography>
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={(_e, v: PeriodDays | null) => { if (v) { setPeriod(v); setSelectedDate(null); } }}
            size="small"
          >
            <ToggleButton value={7}>7d</ToggleButton>
            <ToggleButton value={30}>30d</ToggleButton>
            <ToggleButton value={90}>90d</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_e, v: DailyViewMode | null) => { if (v) setMode(v); }}
          size="small"
        >
          <ToggleButton value="tokens">Tokens</ToggleButton>
          <ToggleButton value="cost">Cost</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'date' }]}
        yAxis={[{ valueFormatter: yFormatter }]}
        series={[
          { dataKey: 'inputTokens', label: 'Input', stack: 'a', color: BAR_COLOR_INPUT },
          { dataKey: 'outputTokens', label: 'Output', stack: 'a', color: BAR_COLOR_OUTPUT },
          { dataKey: 'cacheReadTokens', label: 'Cache Read', stack: 'a', color: BAR_COLOR_CACHE_READ },
          { dataKey: 'cacheCreationTokens', label: 'Cache Write', stack: 'a', color: BAR_COLOR_CACHE_WRITE },
        ]}
        height={240}
        margin={{ left: 60, right: 16, top: 16, bottom: 24 }}
        slotProps={{
          legend: { direction: 'horizontal', position: { vertical: 'top', horizontal: 'end' } },
        }}
        onItemClick={handleBarClick}
      />
      {selectedDate && (
        <DailySessionList
          date={selectedDate}
          sessions={sessions}
          onSelectSession={onSelectSession}
          fetchSessionMessages={fetchSessionMessages}
          fetchSessionCommits={fetchSessionCommits}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </Box>
  );
}

function ModelTable({ items }: Readonly<{ items: AnalyticsData['modelBreakdown'] }>) {
  if (items.length === 0) return null;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Model Breakdown
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Model</TableCell>
            <TableCell align="right">Sessions</TableCell>
            <TableCell align="right">Input Tokens</TableCell>
            <TableCell align="right">Output Tokens</TableCell>
            <TableCell align="right">Est. Cost</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.model}>
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

function BranchTable({ items }: Readonly<{ items: AnalyticsData['branchBreakdown'] }>) {
  if (items.length === 0) return null;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Branch Breakdown
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Branch</TableCell>
            <TableCell align="right">Sessions</TableCell>
            <TableCell align="right">Input Tokens</TableCell>
            <TableCell align="right">Output Tokens</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((b) => (
            <TableRow key={b.branch}>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {b.branch}
              </TableCell>
              <TableCell align="right">{fmtNum(b.sessions)}</TableCell>
              <TableCell align="right">{fmtTokens(b.inputTokens)}</TableCell>
              <TableCell align="right">{fmtTokens(b.outputTokens)}</TableCell>
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

export function AnalyticsPanel({ analytics, isDark: _isDark, sessions = [], onSelectSession, fetchSessionMessages, fetchSessionCommits }: Readonly<AnalyticsPanelProps>) {
  if (!analytics) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">
          Loading analytics...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ overflow: 'auto', flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <OverviewCards totals={analytics.totals} sessions={sessions} />
      <ToolUsageChart items={analytics.toolUsage} />
      <DailyActivityChart items={analytics.dailyActivity} sessions={sessions} onSelectSession={onSelectSession} fetchSessionMessages={fetchSessionMessages} fetchSessionCommits={fetchSessionCommits} />
      <ModelTable items={analytics.modelBreakdown} />
      <BranchTable items={analytics.branchBreakdown} />
    </Box>
  );
}
