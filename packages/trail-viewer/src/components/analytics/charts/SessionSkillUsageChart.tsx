import React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { ToolMetrics } from '../../../domain/parser/types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountSessionSkillUsageChart } from '../../../views/analytics/charts/sessionSkillUsageChart';

export function SessionSkillUsageChart(props: Readonly<{ toolMetrics: ToolMetrics | null }>) {
  const { colors, cardSx, isDark } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountSessionSkillUsageChart}
      props={{ ...props, colors, cardSx, isDark, t: tStr }}
    />
  );
}
