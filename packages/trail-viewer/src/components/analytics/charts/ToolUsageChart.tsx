import React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { AnalyticsData } from '../../../domain/parser/types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountToolUsageChart } from '../../../views/analytics/charts/toolUsageChart';

export function ToolUsageChart(
  props: Readonly<{ items: AnalyticsData['toolUsage'] }>,
) {
  const { chartColors, radius } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountToolUsageChart}
      props={{ ...props, chartColors, radius, t: tStr }}
    />
  );
}
