import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import type { CostOptimizationData } from '../parser/types';
import { useTrailI18n } from '../i18n';

interface CostOptimizationSectionProps {
  readonly data: CostOptimizationData | null;
}

type PeriodMode = 'day' | 'week' | 'month';

const COLORS = {
  actual: '#1976d2',
  skill: '#8b5cf6',
} as const;

const MODEL_COLORS: Readonly<Record<string, string>> = {
  opus: '#7b1fa2',
  sonnet: '#1976d2',
  haiku: '#00897b',
};

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function aggregateByPeriod(
  daily: readonly CostOptimizationData['daily'][number][],
  mode: PeriodMode,
): Array<{ label: string; actualCost: number; skillCost: number }> {
  if (mode === 'day') {
    return daily.map((d) => ({ label: d.date.slice(5), actualCost: d.actualCost, skillCost: d.skillCost }));
  }

  const grouped = new Map<string, { actualCost: number; skillCost: number }>();
  for (const d of daily) {
    // T12:00:00 を付けてローカルTZでも日付がずれないようにする
    const dt = new Date(`${d.date}T12:00:00`);
    let key: string;
    if (mode === 'week') {
      const dayOfWeek = dt.getDay();
      const monday = new Date(dt);
      monday.setDate(dt.getDate() - ((dayOfWeek + 6) % 7));
      const m = String(monday.getMonth() + 1).padStart(2, '0');
      const day = String(monday.getDate()).padStart(2, '0');
      key = `${m}-${day}`;
    } else {
      key = d.date.slice(0, 7);
    }
    const entry = grouped.get(key) ?? { actualCost: 0, skillCost: 0 };
    entry.actualCost += d.actualCost;
    entry.skillCost += d.skillCost;
    grouped.set(key, entry);
  }
  return [...grouped.entries()].map(([label, v]) => ({ label, ...v }));
}

function distToSlices(dist: Readonly<Record<string, number>>): Array<{ id: number; value: number; label: string; color: string }> {
  return Object.entries(dist)
    .filter(([, v]) => v > 0)
    .map(([k, v], i) => {
      const normalized = k.toLowerCase();
      const color = MODEL_COLORS[normalized] ?? `hsl(${i * 60}, 50%, 50%)`;
      return { id: i, value: v, label: k, color };
    });
}

export function CostOptimizationSection({ data }: Readonly<CostOptimizationSectionProps>) {
  const { t } = useTrailI18n();
  const [periodMode, setPeriodMode] = useState<PeriodMode>('day');
  const chartData = useMemo(
    () => (data ? aggregateByPeriod(data.daily, periodMode) : []),
    [data, periodMode],
  );

  if (!data) return null;

  const { actual, skillEstimate, modelDistribution } = data;
  const savingsRate = actual.totalCost > 0
    ? ((actual.totalCost - skillEstimate.totalCost) / actual.totalCost) * 100
    : 0;

  const actualSlices = distToSlices(modelDistribution.actual);
  const recommendedSlices = distToSlices(modelDistribution.skillRecommended);

  return (
    <Box>
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {t('cost.title')}
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">{t('cost.current')}</Typography>
          <Typography variant="h6" sx={{ color: COLORS.actual, fontWeight: 700 }}>
            {fmtUsd(actual.totalCost)}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">{t('cost.optimized')}</Typography>
          <Typography variant="h6" sx={{ color: COLORS.skill, fontWeight: 700 }}>
            {fmtUsd(skillEstimate.totalCost)}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">{t('cost.potentialSavings')}</Typography>
          <Typography variant="h6" sx={{ color: savingsRate > 0 ? COLORS.skill : 'text.primary', fontWeight: 700 }}>
            {savingsRate.toFixed(1)}%
          </Typography>
        </Paper>
      </Box>

      {/* Period Chart */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('cost.costByPeriod')}</Typography>
          <ToggleButtonGroup
            size="small"
            value={periodMode}
            exclusive
            onChange={(_, v: PeriodMode | null) => { if (v) setPeriodMode(v); }}
          >
            <ToggleButton value="day">{t('cost.day')}</ToggleButton>
            <ToggleButton value="week">{t('cost.week')}</ToggleButton>
            <ToggleButton value="month">{t('cost.month')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {chartData.length > 0 ? (
          <BarChart
            height={250}
            xAxis={[{ data: chartData.map((d) => d.label), scaleType: 'band' }]}
            series={[
              { data: chartData.map((d) => d.actualCost), label: t('cost.current'), color: COLORS.actual },
              { data: chartData.map((d) => d.skillCost), label: t('cost.optimized'), color: COLORS.skill },
            ]}
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            {t('cost.noData')}
          </Typography>
        )}
      </Paper>

      {/* Model Distribution */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('cost.modelDistribution')}</Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">{t('cost.current')}</Typography>
            {actualSlices.length > 0 ? (
              <PieChart width={200} height={200} series={[{ data: actualSlices, innerRadius: 30 }]} />
            ) : (
              <Typography variant="body2" color="text.secondary">{t('cost.noDataShort')}</Typography>
            )}
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">{t('cost.optimized')}</Typography>
            {recommendedSlices.length > 0 ? (
              <PieChart width={200} height={200} series={[{ data: recommendedSlices, innerRadius: 30 }]} />
            ) : (
              <Typography variant="body2" color="text.secondary">{t('cost.noDataShort')}</Typography>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
