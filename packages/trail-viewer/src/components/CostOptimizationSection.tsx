import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import type { CostOptimizationData } from '../parser/types';

interface CostOptimizationSectionProps {
  readonly data: CostOptimizationData | null;
  readonly onReclassify?: () => void;
  readonly reclassifying?: boolean;
}

type PeriodMode = 'day' | 'week' | 'month';

const COLORS = {
  actual: '#1976d2',
  rule: '#2e7d32',
  feature: '#ed6c02',
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
): Array<{ label: string; actualCost: number; ruleCost: number; featureCost: number }> {
  if (mode === 'day') {
    return daily.map((d) => ({ label: d.date.slice(5), ...d }));
  }

  const grouped = new Map<string, { actualCost: number; ruleCost: number; featureCost: number }>();
  for (const d of daily) {
    const dt = new Date(d.date);
    let key: string;
    if (mode === 'week') {
      const dayOfWeek = dt.getDay();
      const monday = new Date(dt);
      monday.setDate(dt.getDate() - ((dayOfWeek + 6) % 7));
      key = monday.toISOString().slice(5, 10);
    } else {
      key = d.date.slice(0, 7);
    }
    const entry = grouped.get(key) ?? { actualCost: 0, ruleCost: 0, featureCost: 0 };
    entry.actualCost += d.actualCost;
    entry.ruleCost += d.ruleCost;
    entry.featureCost += d.featureCost;
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

export function CostOptimizationSection({ data, onReclassify, reclassifying }: Readonly<CostOptimizationSectionProps>) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('day');
  const [distMode, setDistMode] = useState<'rule' | 'feature'>('rule');

  const chartData = useMemo(
    () => (data ? aggregateByPeriod(data.daily, periodMode) : []),
    [data, periodMode],
  );

  if (!data) return null;

  const { actual, ruleEstimate, featureEstimate, modelDistribution } = data;
  const bestEstimate = Math.min(ruleEstimate.totalCost, featureEstimate.totalCost);
  const savingsRate = actual.totalCost > 0
    ? ((actual.totalCost - bestEstimate) / actual.totalCost) * 100
    : 0;

  const actualSlices = distToSlices(modelDistribution.actual);
  const recommendedSlices = distToSlices(
    distMode === 'rule' ? modelDistribution.ruleRecommended : modelDistribution.featureRecommended,
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Cost Optimization
        </Typography>
        {onReclassify && (
          <Button
            size="small"
            variant="outlined"
            onClick={onReclassify}
            disabled={reclassifying}
            startIcon={reclassifying ? <CircularProgress size={14} /> : undefined}
          >
            {reclassifying ? 'Reclassifying...' : 'Reclassify'}
          </Button>
        )}
      </Box>

      {/* Summary Cards */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">Actual Cost</Typography>
          <Typography variant="h6" sx={{ color: COLORS.actual, fontWeight: 700 }}>
            {fmtUsd(actual.totalCost)}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">Rule Estimate</Typography>
          <Typography variant="h6" sx={{ color: COLORS.rule, fontWeight: 700 }}>
            {fmtUsd(ruleEstimate.totalCost)}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">Feature Estimate</Typography>
          <Typography variant="h6" sx={{ color: COLORS.feature, fontWeight: 700 }}>
            {fmtUsd(featureEstimate.totalCost)}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">Potential Savings</Typography>
          <Typography variant="h6" sx={{ color: savingsRate > 0 ? COLORS.rule : 'text.primary', fontWeight: 700 }}>
            {savingsRate.toFixed(1)}%
          </Typography>
        </Paper>
      </Box>

      {/* Period Chart */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Cost by Period</Typography>
          <ToggleButtonGroup
            size="small"
            value={periodMode}
            exclusive
            onChange={(_, v: PeriodMode | null) => { if (v) setPeriodMode(v); }}
          >
            <ToggleButton value="day">Day</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="month">Month</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {chartData.length > 0 ? (
          <BarChart
            height={250}
            xAxis={[{ data: chartData.map((d) => d.label), scaleType: 'band' }]}
            series={[
              { data: chartData.map((d) => d.actualCost), label: 'Actual', color: COLORS.actual },
              { data: chartData.map((d) => d.ruleCost), label: 'Rule', color: COLORS.rule },
              { data: chartData.map((d) => d.featureCost), label: 'Feature', color: COLORS.feature },
            ]}
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No data available
          </Typography>
        )}
      </Paper>

      {/* Model Distribution */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Model Distribution</Typography>
          <ToggleButtonGroup
            size="small"
            value={distMode}
            exclusive
            onChange={(_, v: 'rule' | 'feature' | null) => { if (v) setDistMode(v); }}
          >
            <ToggleButton value="rule">Rule</ToggleButton>
            <ToggleButton value="feature">Feature</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Actual</Typography>
            {actualSlices.length > 0 ? (
              <PieChart width={200} height={200} series={[{ data: actualSlices, innerRadius: 30 }]} />
            ) : (
              <Typography variant="body2" color="text.secondary">No data</Typography>
            )}
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Recommended</Typography>
            {recommendedSlices.length > 0 ? (
              <PieChart width={200} height={200} series={[{ data: recommendedSlices, innerRadius: 30 }]} />
            ) : (
              <Typography variant="body2" color="text.secondary">No data</Typography>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
