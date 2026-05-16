import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTrailTheme } from '../../../TrailThemeContext';
import { useTrailI18n } from '../../../../i18n';
import { fmtPercent, fmtTokens } from '../../../../domain/analytics/formatters';
import { getModelBrandColor } from '../../../../theme/designTokens';
import type { ChartMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { hideZero, makeAxisClick } from './axisInfo';

export function ModelsCombinedChart({
  axisInfo,
  modelMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  modelMetric: ChartMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const { modelRows, modelPeriods, modelLabels, models, modelMap, modelMissingByDisplay } = axisInfo;

  const dataset = useMemo(() => {
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
  }, [modelRows, modelPeriods, modelLabels, models, modelMap, modelMetric]);

  const modelSeriesLabel = (model: string): string => {
    const missing = modelMissingByDisplay.get(model);
    const rate = missing && missing.total > 0 ? missing.missing / missing.total : 0;
    return rate > 0 ? `${model} (${t('analytics.combined.missingRate')} ${fmtPercent(rate)})` : model;
  };

  if (models.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
        yAxis={[{ valueFormatter: fmtTokens }]}
        series={models.map((model, i) => ({
          dataKey: `m${i}`,
          label: modelSeriesLabel(model),
          stack: 'total',
          color: getModelBrandColor(model) ?? toolPalette[i % toolPalette.length],
          valueFormatter: hideZero,
        }))}
        height={240}
        margin={{ left: 16, right: 8, top: 8, bottom: 40 }}
        slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
        onAxisClick={makeAxisClick(modelPeriods, canDrill, onDateClick)}
      />
    </Paper>
  );
}
