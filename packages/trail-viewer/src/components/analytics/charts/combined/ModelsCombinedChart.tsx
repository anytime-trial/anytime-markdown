import { useMemo } from 'react';
import { Paper, Typography } from '../../../../ui';
import { useTrailTheme } from '../../../TrailThemeContext';
import { useTrailI18n } from '../../../../i18n';
import { fmtPercent } from '../../../../domain/analytics/formatters';
import { getModelBrandColor } from '../../../../theme/designTokens';
import type { ChartMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { makeCategoryClick } from './axisInfo';
import { AnytimeChartView } from '../AnytimeChartView';
import { buildStackedBarSpec } from '../specs/buildStackedBarSpec';

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

  const modelSeriesLabel = (model: string): string => {
    const missing = modelMissingByDisplay.get(model);
    const rate = missing && missing.total > 0 ? missing.missing / missing.total : 0;
    return rate > 0 ? `${model} (${t('analytics.combined.missingRate')} ${fmtPercent(rate)})` : model;
  };

  const spec = useMemo(() => {
    const getValue = (r: { count: number; tokens: number }): number =>
      modelMetric === 'tokens' ? r.tokens : r.count;
    const valMap = new Map<string, number>();
    for (const r of modelRows) {
      const displayKey = modelMap.get(r.model) ?? r.model;
      valMap.set(`${r.period}::${displayKey}`, (valMap.get(`${r.period}::${displayKey}`) ?? 0) + getValue(r));
    }
    return buildStackedBarSpec({
      categories: modelLabels,
      series: models.map((model, i) => ({
        name: modelSeriesLabel(model),
        values: modelPeriods.map((p) => valMap.get(`${p}::${model}`) ?? 0),
        color: getModelBrandColor(model) ?? toolPalette[i % toolPalette.length],
      })),
    });
  }, [modelRows, modelPeriods, modelLabels, models, modelMap, modelMetric, toolPalette, t, modelMissingByDisplay]);

  if (models.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={240} onCategoryClick={makeCategoryClick(modelPeriods, canDrill, onDateClick)} />
    </Paper>
  );
}
