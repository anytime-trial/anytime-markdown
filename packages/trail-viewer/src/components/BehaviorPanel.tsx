import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';
import type {
  BehaviorData,
  BehaviorPeriodMode,
  BehaviorRangeDays,
} from '../parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';

const PALETTE = [
  '#1976d2', '#8b5cf6', '#00897b', '#e65100', '#c62828',
  '#6d4c41', '#37474f', '#f9a825', '#558b2f', '#ad1457',
] as const;

export interface BehaviorPanelProps {
  readonly fetchBehaviorData: (
    period: BehaviorPeriodMode,
    rangeDays: BehaviorRangeDays,
  ) => Promise<BehaviorData>;
}

// ─── Section: ① Tool Sequences ───────────────────────────────────────────────

function ToolSequencesSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const rows = data.toolSequences.slice(0, 10);
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.toolSequences')}</Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">—</Typography>
      ) : (
        <BarChart
          dataset={rows.map(r => ({ sequence: r.sequence.slice(0, 30), count: r.count }))}
          xAxis={[{ scaleType: 'band', dataKey: 'sequence' }]}
          series={[{ dataKey: 'count', label: 'count' }]}
          height={220}
          margin={{ left: 8, right: 8, top: 8, bottom: 60 }}
        />
      )}
    </Paper>
  );
}

// ─── Section: ② Repeated Ops ─────────────────────────────────────────────────

function RepeatOpsSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const rows = data.repeatOps;
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.repeatOps')}</Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">—</Typography>
      ) : (
        <LineChart
          xAxis={[{ scaleType: 'band', data: rows.map(r => r.period) }]}
          series={[{ data: rows.map(r => r.count), label: 'count' }]}
          height={200}
          margin={{ left: 40, right: 8, top: 8, bottom: 40 }}
        />
      )}
    </Paper>
  );
}

// ─── Section: ③ Avg Tools per Turn ───────────────────────────────────────────

function AvgToolsSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const rows = data.avgToolsPerTurn;
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.avgTools')}</Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">—</Typography>
      ) : (
        <LineChart
          xAxis={[{ scaleType: 'band', data: rows.map(r => r.period) }]}
          series={[{ data: rows.map(r => Math.round(r.avg * 100) / 100), label: 'avg' }]}
          height={200}
          margin={{ left: 40, right: 8, top: 8, bottom: 40 }}
        />
      )}
    </Paper>
  );
}

// ─── Section: ④ Subagent Rate ─────────────────────────────────────────────────

function SubagentSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const rows = data.subagentRate;
  const byTypeMap: Readonly<Record<string, number[]>> = {};
  for (const r of rows) {
    for (const [type, cnt] of Object.entries(r.byType)) {
      if (!byTypeMap[type]) Object.assign(byTypeMap, { [type]: [] });
      byTypeMap[type].push(cnt);
    }
  }
  const series = Object.entries(byTypeMap).map(([label, vals], i) => ({
    data: vals,
    label,
    color: PALETTE[i % PALETTE.length],
    stack: 'a',
  }));
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.subagent')}</Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">—</Typography>
      ) : (
        <BarChart
          xAxis={[{ scaleType: 'band', data: rows.map(r => r.period) }]}
          series={series.length > 0 ? series : [{ data: rows.map(r => r.rate), label: 'rate' }]}
          height={200}
          margin={{ left: 40, right: 8, top: 8, bottom: 40 }}
        />
      )}
    </Paper>
  );
}

// ─── Section: ⑤ Error Patterns ───────────────────────────────────────────────

function ErrorPatternsSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const rows = data.errorRate;
  const toolMap: Readonly<Record<string, number[]>> = {};
  for (const r of rows) {
    for (const [tool, cnt] of Object.entries(r.byTool)) {
      if (!toolMap[tool]) Object.assign(toolMap, { [tool]: [] });
      toolMap[tool].push(cnt);
    }
  }
  const series = Object.entries(toolMap).map(([label, vals], i) => ({
    data: vals,
    label,
    color: PALETTE[i % PALETTE.length],
  }));
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.errors')}</Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">—</Typography>
      ) : (
        <BarChart
          xAxis={[{ scaleType: 'band', data: rows.map(r => r.period) }]}
          series={series.length > 0 ? series : [{ data: rows.map(r => r.rate), label: 'rate' }]}
          height={200}
          margin={{ left: 40, right: 8, top: 8, bottom: 40 }}
        />
      )}
    </Paper>
  );
}

// ─── Section: ⑥ Skill Analysis ───────────────────────────────────────────────

function SkillSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const rows = data.skillStats;
  const bySkill: Readonly<Record<string, number>> = {};
  for (const r of rows) {
    Object.assign(bySkill, { [r.skill]: (bySkill[r.skill] ?? 0) + r.count });
  }
  const pieData = Object.entries(bySkill).map(([label, value]) => ({ label, value }));
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.skills')}</Typography>
      {pieData.length === 0 ? (
        <Typography variant="body2" color="text.secondary">—</Typography>
      ) : (
        <PieChart
          series={[{ data: pieData, innerRadius: 40, outerRadius: 80 }]}
          height={200}
          margin={{ left: 80, right: 80, top: 8, bottom: 8 }}
        />
      )}
    </Paper>
  );
}

// ─── Section: ⑦ Cache Efficiency ─────────────────────────────────────────────

function CacheSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const rows = data.cacheEfficiency.filter(r => r.isAnomaly);
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.cache')}</Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">—</Typography>
      ) : (
        <LineChart
          xAxis={[{ scaleType: 'band', data: rows.map(r => r.period) }]}
          series={[{ data: rows.map(r => Math.round(r.hitRate * 1000) / 10), label: 'hit%' }]}
          height={200}
          margin={{ left: 40, right: 8, top: 8, bottom: 40 }}
        />
      )}
    </Paper>
  );
}

// ─── Section: ⑧ User Corrections ─────────────────────────────────────────────

function CorrectionsSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const rows = data.corrections;
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.corrections')}</Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">—</Typography>
      ) : (
        <LineChart
          xAxis={[{ scaleType: 'band', data: rows.map(r => r.period) }]}
          series={[{ data: rows.map(r => r.count), label: 'count' }]}
          height={200}
          margin={{ left: 40, right: 8, top: 8, bottom: 40 }}
        />
      )}
    </Paper>
  );
}

// ─── Main: BehaviorPanel ──────────────────────────────────────────────────────

const RANGE_OPTIONS: readonly BehaviorRangeDays[] = [30, 90, 180];

export function BehaviorPanel({ fetchBehaviorData }: Readonly<BehaviorPanelProps>) {
  const { t } = useTrailI18n();
  const [period, setPeriod] = useState<BehaviorPeriodMode>('day');
  const [rangeDays, setRangeDays] = useState<BehaviorRangeDays>(30);
  const [data, setData] = useState<BehaviorData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchBehaviorData(period, rangeDays);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [fetchBehaviorData, period, rangeDays]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          size="small"
          value={period}
          exclusive
          onChange={(_, v: BehaviorPeriodMode | null) => { if (v) setPeriod(v); }}
        >
          <ToggleButton value="day">{t('behavior.period.day')}</ToggleButton>
          <ToggleButton value="week">{t('behavior.period.week')}</ToggleButton>
          <ToggleButton value="session">{t('behavior.period.session')}</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          value={rangeDays}
          exclusive
          onChange={(_, v: BehaviorRangeDays | null) => { if (v) setRangeDays(v); }}
        >
          {RANGE_OPTIONS.map(d => (
            <ToggleButton key={d} value={d}>{d}{t('behavior.range.days')}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Content */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      )}
      {!loading && data && (
        <>
          <ToolSequencesSection data={data} />
          <RepeatOpsSection data={data} />
          <AvgToolsSection data={data} />
          <SubagentSection data={data} />
          <ErrorPatternsSection data={data} />
          <SkillSection data={data} />
          <CacheSection data={data} />
          <CorrectionsSection data={data} />
        </>
      )}
    </Box>
  );
}
