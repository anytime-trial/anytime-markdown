import React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { AnalyticsData, CostOptimizationData } from '../../../domain/parser/types';
import type { BucketUnit, DailyViewMode, PeriodDays } from '../types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountDailyActivityChart } from '../../../views/analytics/charts/dailyActivityChart';

export function DailyActivityChart(
  props: Readonly<{
    items: AnalyticsData['dailyActivity'];
    period: PeriodDays;
    bucket: BucketUnit;
    mode: DailyViewMode;
    onDateClick?: (fullDate: string) => void;
    costOptimization?: CostOptimizationData | null;
    overlay?: {
      bucket: 'day' | 'week';
      tokens: ReadonlyArray<{ bucketStart: string; value: number }>;
      cost: ReadonlyArray<{ bucketStart: string; value: number }>;
    } | null;
  }>,
) {
  const { chartColors, cardSx, isDark } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountDailyActivityChart}
      props={{ ...props, chartColors, cardSx, isDark, t: tStr }}
    />
  );
}
