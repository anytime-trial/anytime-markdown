import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

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
const BAR_COLOR_SECONDARY = '#66bb6a';

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

function DailyActivityChart({ items }: Readonly<{ items: AnalyticsData['dailyActivity'] }>) {
  if (items.length === 0) return null;
  const maxTokens = Math.max(...items.map((d) => d.inputTokens + d.outputTokens), 1);

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Daily Activity (Last 30 Days)
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 120 }}>
        {items.map((day) => {
          const total = day.inputTokens + day.outputTokens;
          const pct = (total / maxTokens) * 100;
          return (
            <Box
              key={day.date}
              title={`${day.date}\n${fmtNum(day.sessions)} sessions\n${fmtTokens(total)} tokens`}
              sx={{
                flex: 1,
                minWidth: 4,
                height: `${Math.max(pct, 2)}%`,
                bgcolor: BAR_COLOR_SECONDARY,
                borderRadius: '2px 2px 0 0',
                cursor: 'default',
              }}
            />
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {items.at(0)?.date ?? ''}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {items.at(-1)?.date ?? ''}
        </Typography>
      </Box>
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

export function AnalyticsPanel({ analytics, isDark: _isDark }: Readonly<AnalyticsPanelProps>) {
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
      <DailyActivityChart items={analytics.dailyActivity} />
      <ModelTable items={analytics.modelBreakdown} />
      <BranchTable items={analytics.branchBreakdown} />
    </Box>
  );
}
