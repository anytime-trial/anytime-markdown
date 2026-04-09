import { useState } from 'react';
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
import type { TrailMessage, TrailSession } from '../parser/types';

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

function OverviewCards({ totals }: Readonly<{ totals: AnalyticsData['totals'] }>) {
  const cards = [
    { label: 'Total Sessions', value: fmtNum(totals.sessions) },
    { label: 'Total Tokens', value: fmtTokens(totals.inputTokens + totals.outputTokens) },
    { label: 'Estimated Cost', value: fmtUsd(totals.estimatedCostUsd) },
    { label: 'Cache Read Tokens', value: fmtTokens(totals.cacheReadTokens) },
  ];

  return (
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

function DailySessionList({
  date,
  sessions,
  onSelectSession,
  fetchSessionMessages,
  onClose,
}: Readonly<{
  date: string;
  sessions: readonly TrailSession[];
  onSelectSession?: (id: string) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
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
              <TableCell align="right">Input</TableCell>
              <TableCell align="right">Output</TableCell>
              <TableCell align="right">Cache Read</TableCell>
              <TableCell align="right">Init Context</TableCell>
              <TableCell align="right">Peak Context</TableCell>
              <TableCell align="right">Messages</TableCell>
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
                <TableCell align="right">{fmtTokens(s.usage.inputTokens)}</TableCell>
                <TableCell align="right">{fmtTokens(s.usage.outputTokens)}</TableCell>
                <TableCell align="right">{fmtTokens(s.usage.cacheReadTokens)}</TableCell>
                <TableCell align="right">{fmtTokens(s.initialContextTokens ?? 0)}</TableCell>
                <TableCell align="right">{fmtTokens(s.peakContextTokens ?? 0)}</TableCell>
                <TableCell align="right">{fmtNum(s.messageCount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {timelineLoading && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Loading timeline...</Typography>
      )}
      {timelineSessionId && timelineMessages.length > 0 && (
        <SessionCacheTimeline
          messages={timelineMessages}
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
}: Readonly<{
  items: AnalyticsData['dailyActivity'];
  sessions: readonly TrailSession[];
  onSelectSession?: (id: string) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
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

export function AnalyticsPanel({ analytics, isDark: _isDark, sessions = [], onSelectSession, fetchSessionMessages }: Readonly<AnalyticsPanelProps>) {
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
      <OverviewCards totals={analytics.totals} />
      <ToolUsageChart items={analytics.toolUsage} />
      <DailyActivityChart items={analytics.dailyActivity} sessions={sessions} onSelectSession={onSelectSession} fetchSessionMessages={fetchSessionMessages} />
      <ModelTable items={analytics.modelBreakdown} />
      <BranchTable items={analytics.branchBreakdown} />
    </Box>
  );
}
