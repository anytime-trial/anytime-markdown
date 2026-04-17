import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';

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
  const rows = data.toolSequences;
  if (rows.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.toolSequences')}</Typography>
        <Typography variant="body2" color="text.secondary">—</Typography>
      </Paper>
    );
  }

  // 複数期間があればスタック棒グラフ（横軸=期間）、単一期間ならランキング棒グラフ
  // avgToolsPerTurn から全期間を取得し、ビグラムがない日も 0 埋めする
  const allPeriods = [...new Set([
    ...rows.map(r => r.period),
    ...(data.toolCounts ?? []).map(a => a.period),
  ])].sort();
  const sequences = [...new Set(rows.map(r => r.sequence))];
  const hasMultiplePeriods = allPeriods.length > 1;

  if (hasMultiplePeriods) {
    // 期間×シーケンスのマトリクスを構築
    // dataKey に特殊文字（→）を含めると MUI X Charts がクラッシュするため、
    // サニタイズしたキー（seq0, seq1, ...）を使い label に元の名前を表示する
    const countMap = new Map<string, number>();
    for (const r of rows) {
      countMap.set(`${r.period}::${r.sequence}`, r.count);
    }
    const dataset = allPeriods.map(p => {
      const entry: Record<string, string | number> = { period: p.slice(5) };
      for (let si = 0; si < sequences.length; si++) {
        entry[`seq${si}`] = countMap.get(`${p}::${sequences[si]}`) ?? 0;
      }
      return entry;
    });
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.toolSequences')}</Typography>
        <BarChart
          dataset={dataset}
          xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
          series={sequences.map((seq, i) => ({
            dataKey: `seq${i}`,
            label: seq,
            stack: 'total',
            color: PALETTE[i % PALETTE.length],
          }))}
          height={220}
          margin={{ left: 8, right: 8, top: 8, bottom: 60 }}
        />
      </Paper>
    );
  }

  // 単一期間: ランキング表示
  const ranked = [...rows].sort((a, b) => b.count - a.count).slice(0, 10);
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.toolSequences')}</Typography>
      <BarChart
        dataset={ranked.map(r => ({ sequence: r.sequence.slice(0, 30), count: r.count }))}
        xAxis={[{ scaleType: 'band', dataKey: 'sequence' }]}
        series={[{ dataKey: 'count', label: 'count' }]}
        height={220}
        margin={{ left: 8, right: 8, top: 8, bottom: 60 }}
      />
    </Paper>
  );
}

// ─── Section: ①-b Tool Counts ─────────────────────────────────────────────────

type ToolCountMetric = 'count' | 'tokens' | 'duration';

function ToolCountsSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [metric, setMetric] = useState<ToolCountMetric>('count');
  const rows = data.toolCounts ?? [];
  if (rows.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.toolCounts')}</Typography>
        <Typography variant="body2" color="text.secondary">—</Typography>
      </Paper>
    );
  }

  const getValue = (r: { count: number; tokens?: number; durationMs?: number }): number =>
    metric === 'tokens' ? (r.tokens ?? 0)
    : metric === 'duration' ? Math.round((r.durationMs ?? 0) / 1000)
    : r.count;
  const seriesLabel = metric === 'tokens' ? 'tokens' : metric === 'duration' ? 'sec' : 'count';
  const allPeriods = [...new Set([
    ...rows.map(r => r.period),
    ...(data.toolCounts ?? []).map(a => a.period),
  ])].sort();
  const tools = [...new Set(rows.map(r => r.tool))];
  const hasMultiplePeriods = allPeriods.length > 1;

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
      <Typography variant="subtitle2">{t('behavior.sections.toolCounts')}</Typography>
      <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, v: ToolCountMetric | null) => { if (v) setMetric(v); }}>
        <ToggleButton value="count">{t('behavior.toolCounts.count')}</ToggleButton>
        <ToggleButton value="tokens">{t('behavior.toolCounts.tokens')}</ToggleButton>
        <ToggleButton value="duration">{t('behavior.toolCounts.duration')}</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );

  if (hasMultiplePeriods) {
    const valMap = new Map<string, number>();
    for (const r of rows) {
      const v = getValue(r);
      valMap.set(`${r.period}::${r.tool}`, (valMap.get(`${r.period}::${r.tool}`) ?? 0) + v);
    }
    const dataset = allPeriods.map(p => {
      const entry: Record<string, string | number> = { period: p.slice(5) };
      for (let ti = 0; ti < tools.length; ti++) {
        entry[`t${ti}`] = valMap.get(`${p}::${tools[ti]}`) ?? 0;
      }
      return entry;
    });
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        {header}
        <BarChart
          dataset={dataset}
          xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
          series={tools.map((tool, i) => ({
            dataKey: `t${i}`,
            label: tool,
            stack: 'total',
            color: PALETTE[i % PALETTE.length],
          }))}
          height={220}
          margin={{ left: 8, right: 8, top: 8, bottom: 60 }}
        />
      </Paper>
    );
  }

  const ranked = [...rows].sort((a, b) => getValue(b) - getValue(a)).slice(0, 10);
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      {header}
      <BarChart
        dataset={ranked.map(r => ({ tool: r.tool, value: getValue(r) }))}
        xAxis={[{ scaleType: 'band', dataKey: 'tool' }]}
        series={[{ dataKey: 'value', label: seriesLabel }]}
        height={220}
        margin={{ left: 8, right: 8, top: 8, bottom: 60 }}
      />
    </Paper>
  );
}

// ─── Section: ② Repeated Ops ─────────────────────────────────────────────────


// ─── Section: ⑤ Error Patterns ───────────────────────────────────────────────

function ErrorPatternsSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const rows = data.errorRate ?? [];

  // toolCounts から全期間を取得して 0 埋め
  const allPeriods = [...new Set([
    ...rows.map(r => r.period),
    ...(data.toolCounts ?? []).map(a => a.period),
  ])].sort();
  const labels = allPeriods.map(p => p.length > 5 ? p.slice(5) : p);

  const rowByPeriod = new Map(rows.map(r => [r.period, r]));
  const allTools = [...new Set(rows.flatMap(r => Object.keys(r.byTool)))];

  if (allPeriods.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.errors')}</Typography>
        <Typography variant="body2" color="text.secondary">—</Typography>
      </Paper>
    );
  }

  // サニタイズした dataKey を使用
  const dataset = allPeriods.map(p => {
    const entry: Record<string, string | number> = { period: labels[allPeriods.indexOf(p)] };
    for (let ti = 0; ti < allTools.length; ti++) {
      entry[`e${ti}`] = rowByPeriod.get(p)?.byTool[allTools[ti]] ?? 0;
    }
    return entry;
  });

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.errors')}</Typography>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
        series={allTools.map((tool, i) => ({
          dataKey: `e${i}`,
          label: tool,
          stack: 'total',
          color: PALETTE[i % PALETTE.length],
        }))}
        height={200}
        margin={{ left: 40, right: 8, top: 8, bottom: 40 }}
      />
    </Paper>
  );
}

// ─── Section: ⑥ Skill Analysis ───────────────────────────────────────────────

function SkillSection({ data }: Readonly<{ data: BehaviorData }>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const rows = data.skillStats ?? [];

  const allPeriods = [...new Set([
    ...rows.map(r => r.period),
    ...(data.toolCounts ?? []).map(a => a.period),
  ])].sort();
  const labels = allPeriods.map(p => p.length > 5 ? p.slice(5) : p);
  const skills = [...new Set(rows.map(r => r.skill))];

  if (allPeriods.length === 0 || skills.length === 0) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.skills')}</Typography>
        <Typography variant="body2" color="text.secondary">—</Typography>
      </Paper>
    );
  }

  const countMap = new Map<string, number>();
  for (const r of rows) {
    countMap.set(`${r.period}::${r.skill}`, (countMap.get(`${r.period}::${r.skill}`) ?? 0) + r.count);
  }
  const dataset = allPeriods.map(p => {
    const entry: Record<string, string | number> = { period: labels[allPeriods.indexOf(p)] };
    for (let si = 0; si < skills.length; si++) {
      entry[`s${si}`] = countMap.get(`${p}::${skills[si]}`) ?? 0;
    }
    return entry;
  });

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{t('behavior.sections.skills')}</Typography>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
        series={skills.map((skill, i) => ({
          dataKey: `s${i}`,
          label: skill,
          stack: 'total',
          color: PALETTE[i % PALETTE.length],
        }))}
        height={200}
        margin={{ left: 40, right: 8, top: 8, bottom: 40 }}
      />
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
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <ToolSequencesSection data={data} />
            <ToolCountsSection data={data} />
          </Box>
          <ErrorPatternsSection data={data} />
          <SkillSection data={data} />
          <CacheSection data={data} />
          <CorrectionsSection data={data} />
        </>
      )}
    </Box>
  );
}
